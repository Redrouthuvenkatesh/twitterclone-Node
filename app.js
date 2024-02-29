const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
const jsonMiddleware = express.json()
app.use(jsonMiddleware)
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null

const dbPath = path.join(__dirname, 'twitterClone.db')

const initializeDbAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})
    console.log('Database connected')

    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000')
    })
  } catch (error) {
    console.error(`Error connecting to database: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

// User Register
//API1
app.post('/register/', async (req, res) => {
  const {username, password, name, gender} = req.body

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    // Check if the user already exists
    const checkUserQuery = `SELECT * FROM user WHERE username = ?`
    const existingUser = await db.get(checkUserQuery, [username])

    if (existingUser) {
      return res.status(400).send('User already exists')
    }

    // Check if the password meets the minimum length requirement
    if (password.length < 6) {
      return res.status(400).send('Password is too short')
    }

    // Insert the new user into the database
    const insertUserQuery = `
      INSERT INTO User (username, password, name, gender)
      VALUES (?, ?, ?, ?)
    `
    await db.run(insertUserQuery, [username, hashedPassword, name, gender])

    // Send a success response
    res.send('User created successfully')
  } catch (error) {
    console.error('Error during registration:', error.message)
    res.status(500).send('Internal Server Error')
  }
})

//Api2
app.post('/login', async (req, res) => {
  const {username, password} = req.body
  try {
    const selectUserQuery = 'SELECT * FROM user WHERE username = ?'
    const dbUser = await db.get(selectUserQuery, [username])

    if (!dbUser) {
      return res.status(400).send('Invalid user')
    }

    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatch) {
      const payload = {
        username: username,
        user_id: dbUser.user_id,
        tweet_id: dbUser.tweet_id,
        reply_id: dbUser.reply_id,
      }
      let jwtToken = jwt.sign(payload, 'Abcdef123')
      res.send({jwtToken})
    } else {
      res.status(400).send('Invalid password')
    }
  } catch (error) {
    console.error(`Error logging in: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

async function authentication(req, res, next) {
  try {
    let jwtToken
    const authHeader = req.headers['authorization']
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(' ')[1]
    }
    if (jwtToken === undefined) {
      return res.status(401).send('Invalid JWT Token')
    }

    jwt.verify(jwtToken, 'Abcdef123', async (err, payload) => {
      if (err) {
        return res.status(401).send('Invalid JWT Token')
      } else {
        req.username = payload.username
        req.user_id = payload.user_id

        next() // Proceed to the next middleware or handler
      }
    })
  } catch (error) {
    console.error('Error in authentication middleware:', error.message)
    res.status(500).send('Internal Server Error')
  }
}

const tweetacessVerification = async (req, res, next) => {
  const {user_id} = req
  const {tweetID} = req.params
  const tweetQuery = `select * from tweet inner join follower on tweet.user_id=follower.following_user_id where
  tweet.tweet_id=? and follower_user_id=?`
  const tweet = await db.get(tweetQuery, [tweetID, user_id])
  if (tweet === undefined) {
    res.status(401).send('Invalid request')
  } else {
    next()
  }
}
const followingpeopleId = async (req, res) => {
  const {username} = req
  const getFollowPeopleQuery = `select following_user_id from follower inner join user on user.user_id=follower.follower_user_id
  where user.username=?`
  const followingPeople = await db.all(getFollowPeopleQuery, [username])
  const arrayOfIDs = followingPeople.map(each => each.following_user_id)
  return arrayOfIDs
}
//API3
// app.get('/user/tweets/feed/', authentication, async (req, res) => {
//   const queryuser = `SELECT u.username, t.tweet, t.date_time AS dateTime
//     FROM User u
//     JOIN Follower f ON u.user_id = f.following_user_id
//     JOIN Tweet t ON t.user_id = f.following_user_id
//     ORDER BY u.user_id desc
//     LIMIT 4;`
//   try {
//     const dbResponse = await db.all(queryuser)
//     res.send(dbResponse)
//   } catch (err) {
//     console.log(`Error in getting:${err.message}`)
//     res.status(500).send('Internal Server Error')
//   }
// })
app.get('/user/tweets/feed/', authentication, async (req, res) => {
  const {user_id} = req

  // Query to retrieve the latest 4 tweets from people whom the user follows
  const queryuser = `
    SELECT u.username, t.tweet, t.date_time AS dateTime
    FROM User u
    JOIN Follower f ON u.user_id = f.following_user_id
    JOIN Tweet t ON t.user_id = f.following_user_id
    WHERE f.follower_user_id = ?
    ORDER BY t.date_time DESC
    LIMIT 4;
  `

  try {
    const dbResponse = await db.all(queryuser, [user_id])
    res.send(dbResponse)
  } catch (err) {
    console.log(`Error in getting feed: ${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

//API4
app.get('/user/following/', authentication, async (req, res) => {
  const {user_id} = req
  const queryFollowing = `SELECT u.name
                          FROM Follower f 
                          INNER JOIN user as u ON u.user_id = f.following_user_id
                          WHERE f.follower_user_id = ?;`
  try {
    const dbResponse = await db.all(queryFollowing, [user_id])
    res.json(dbResponse)
  } catch (err) {
    console.log(`Error in getting following:${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

//API 5
app.get('/user/followers/', authentication, async (req, res) => {
  const {user_id} = req
  const queryFollowers = `SELECT u.name
                          FROM Follower f 
                          INNER JOIN user as u ON u.user_id = f.follower_user_id
                          WHERE f.following_user_id = ?;`
  try {
    const dbResponse = await db.all(queryFollowers, [user_id])
    res.json(dbResponse)
  } catch (err) {
    console.log(`Error in getting followers:${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

//API6
// app.get(
//   '/tweets/:tweetId/',
//   authentication,
//   tweetacessVerification,
//   async (req, res) => {
//     try {
//       const {user_id} = req
//       const {tweetId} = req.params

//       // Query to check if the user is allowed to access the tweet
//       // const userFollowsQuery = `
//       //   SELECT COUNT(*) AS count
//       //   FROM follower
//       //   WHERE follower_user_id = ? AND following_user_id = (
//       //     SELECT user_id FROM tweet WHERE tweet_id = ?
//       //   )
//       // `

//       // const {count} = await db.get(userFollowsQuery, [user_id, tweetId])

//       // if (count === 0) {
//       //   // Scenario 1: If the user is not following the user who posted the tweet
//       //   return res.status(401).json({error: 'Invalid Request'})
//       // }

//       // Scenario 2: If the user is following the user who posted the tweet
//       const tweetDetailsQuery = `
//       SELECT
//         tweet,
//         (SELECT COUNT(*) FROM like WHERE tweet_id = ?) AS likes,
//         (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) AS replies,
//         date_time AS dateTime
//       FROM tweet
//       WHERE tweet.tweet_id = ?
//     `

//       const tweetDetails = await db.get(tweetDetailsQuery, [
//         tweetId,
//         tweetId,
//         tweetId,
//       ])
//       if (tweetDetails === undefined) {
//         res.status(401).send('Invalid Request')
//       }
//       res.send(tweetDetails)
//     } catch (error) {
//       console.error(`Error retrieving tweet details: ${error.message}`)
//       res.status(500).send('Internal Server Error')
//     }
//   },
// )
app.get('/tweets/:tweetId/', authentication, async (req, res) => {
  try {
    const {user_id} = req
    const {tweetId} = req.params

    // Query to check if the user is allowed to access the tweet
    const userFollowsQuery = `
        SELECT COUNT(*) AS count
        FROM follower
        WHERE follower_user_id = ? AND following_user_id = (
          SELECT user_id FROM tweet WHERE tweet_id = ?
        )
      `

    const {count} = await db.get(userFollowsQuery, [user_id, tweetId])

    if (count === 0) {
      // Scenario 1: If the user is not following the user who posted the tweet
      return res.status(401).send('Invalid Request')
    }

    // Scenario 2: If the user is following the user who posted the tweet
    const tweetDetailsQuery = `
        SELECT 
          tweet, 
          (SELECT COUNT(*) FROM "like" WHERE tweet_id = ?) AS likes, 
          (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) AS replies, 
          date_time AS dateTime
        FROM tweet
        WHERE tweet.tweet_id = ?
      `

    const tweetDetails = await db.get(tweetDetailsQuery, [
      tweetId,
      tweetId,
      tweetId,
    ])

    if (!tweetDetails) {
      // Tweet not found
      return res.status(404).send('Tweet not found')
    }

    res.send(tweetDetails)
  } catch (error) {
    console.error(`Error retrieving tweet details: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

//API7
// app.get(
//   '/tweets/:tweetId/likes/',
//   authentication,
//   tweetacessVerification,
//   async (req, res) => {
//     try {
//       const {tweetId} = req.params

//       const getLikesQuery = `
//       SELECT u.username
//       FROM user AS u
//       INNER JOIN like AS l ON u.user_id = l.user_id
//       WHERE l.tweet_id = ?
//     `

//       const likeUsers = await db.all(getLikesQuery, [tweetId])
//       const userArray = likeUsers.map(eachUser => eachUser.username)

//       res.json({likes: userArray})
//     } catch (error) {
//       console.error(`Error retrieving tweet likes: ${error.message}`)
//       res.status(500).send('Internal Server Error')
//     }
//   },
// )
app.get('/tweets/:tweetId/likes/', authentication, async (req, res) => {
  try {
    const {user_id} = req
    const {tweetId} = req.params

    const userFollowsQuery = `
        SELECT COUNT(*) AS count
        FROM follower
        WHERE follower_user_id = ? 
        AND following_user_id = (
          SELECT user_id FROM tweet WHERE tweet_id = ?
        )
      `

    const {count} = await db.get(userFollowsQuery, [user_id, tweetId])

    if (count === 0) {
      return res.status(401).send('Invalid Request')
    }

    const getLikesQuery = `
        SELECT u.username
        FROM user AS u
        INNER JOIN like AS l ON u.user_id = l.user_id
        WHERE l.tweet_id = ?
      `

    const likeUsers = await db.all(getLikesQuery, [tweetId])
    const userArray = likeUsers.map(eachUser => eachUser.username)

    res.json({likes: userArray})
  } catch (error) {
    console.error(`Error retrieving tweet likes: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

//API 8

// app.get(
//   '/tweets/:tweetId/replies/',
//   authentication,
//   tweetacessVerification,
//   async (req, res) => {
//     try {
//       const {tweetId} = req.params

//       const replyQueries = `
//       SELECT u.name, r.reply
//       FROM user AS u
//       INNER JOIN reply AS r ON u.user_id = r.user_id
//       WHERE r.tweet_id = ?
//     `

//       const result = await db.all(replyQueries, [tweetId])

//       if (result.length === 0) {
//         res.status(401).send('Invalid Request')
//       } else {
//         const replyResult = result.map(each => ({
//           name: each.name,
//           reply: each.reply,
//         }))
//         res.json({replies: replyResult})
//       }
//     } catch (error) {
//       console.error(`Error retrieving tweet replies: ${error.message}`)
//       res.status(500).send('Internal Server Error')
//     }
//   },
// )
app.get('/tweets/:tweetId/replies/', authentication, async (req, res) => {
  try {
    const {user_id} = req
    const {tweetId} = req.params

    // Query to check if the user is allowed to access the tweet
    const userFollowsQuery = `
        SELECT COUNT(*) AS count
        FROM follower
        WHERE follower_user_id = ? 
        AND following_user_id = (
          SELECT user_id FROM tweet WHERE tweet_id = ?
        )
      `

    const {count} = await db.get(userFollowsQuery, [user_id, tweetId])

    if (count === 0) {
      // If the user is not following the user who posted the tweet
      return res.status(401).send('Invalid Request')
    }

    // If the user is following the user who posted the tweet
    const replyQueries = `
        SELECT u.name, r.reply
        FROM user AS u
        INNER JOIN reply AS r ON u.user_id = r.user_id
        WHERE r.tweet_id = ?
      `

    const result = await db.all(replyQueries, [tweetId])

    if (result.length === 0) {
      return res.status(404).send('No replies found')
    }

    const replyResult = result.map(each => ({
      name: each.name,
      reply: each.reply,
    }))

    res.json({replies: replyResult})
  } catch (error) {
    console.error(`Error retrieving tweet replies: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

// API 9

// app.get('/user/tweets/', authentication, async (req, res) => {
//   const {user_id} = req
//   const tweetQuery = `
//     SELECT t.tweet,
//            COUNT(l.like_id) AS likes,
//            COUNT(r.reply_id) AS replies
//     FROM tweet AS t
//     LEFT JOIN like AS l ON t.tweet_id = l.tweet_id
//     LEFT JOIN reply AS r ON t.tweet_id = r.tweet_id
//     WHERE t.user_id = ?
//     GROUP BY t.tweet_id;`
//   try {
//     const result = await db.all(tweetQuery, [user_id])
//     res.json(result)
//   } catch (err) {
//     console.log(`Error in getting user tweets: ${err.message}`)
//     res.status(500).send('Internal Server Error')
//   }
// })
app.get('/user/tweets/', authentication, async (req, res) => {
  const {user_id} = req

  const tweetQuery = `
    SELECT t.tweet, 
           COUNT(l.like_id) AS likes, 
           COUNT(r.reply_id) AS replies, 
           t.date_time AS dateTime
    FROM tweet AS t
    LEFT JOIN "like" AS l ON t.tweet_id = l.tweet_id
    LEFT JOIN reply AS r ON t.tweet_id = r.tweet_id
    WHERE t.user_id = ?
    GROUP BY t.tweet_id;
  `

  try {
    const result = await db.all(tweetQuery, [user_id])
    res.json(result)
  } catch (err) {
    console.error(`Error in getting user tweets: ${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

// Api 10
app.post('/user/tweets/', authentication, async (req, res) => {
  try {
    const {tweet} = req.body
    const createQuery = `INSERT INTO tweet (tweet) VALUES (?)`

    await db.run(createQuery, [tweet])

    res.status(201).send('Created a Tweet')
  } catch (error) {
    console.error(`Error creating tweet: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

// Api 11
app.delete('/tweets/:tweetId/', authentication, async (req, res) => {
  const {tweetId} = req.params
  const {user_id} = req

  try {
    // Check if the tweet exists and belongs to the authenticated user
    const tweetOwnerQuery = `SELECT * FROM tweet WHERE user_id = ? AND tweet_id = ?`
    const tweetOwner = await db.get(tweetOwnerQuery, [user_id, tweetId])

    if (!tweetOwner) {
      // Scenario: The tweet doesn't exist or doesn't belong to the user
      return res.status(401).send('Invalid Request')
    }

    // Delete the tweet
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ?`
    await db.run(deleteTweetQuery, [tweetId])

    res.send('Tweet Removed')
  } catch (error) {
    console.error(`Error deleting tweet: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

module.exports = app
