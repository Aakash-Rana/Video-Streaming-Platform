const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const expressSession = require('express-session');

const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;

const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const formidable = require('formidable');
const fileSystem = require('fs');
app.use(expressSession({
    "key": "user_id",
    "secret": "User secret Object Id",
    "resave": true,
    "saveUninitialized": true
}))
app.use(bodyParser.json({
    limit: "10000mb",
    parameterLimit: 1000000
}))

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/public', express.static(__dirname + "/public"))
app.set('view engine', 'ejs');

function getUser(userId, callBack) {
    database.collection("users").findOne({
        "_id": ObjectId(userId)
    }, function (error, result) {
        if (callBack != null) {
            callBack(result);
        }
    });
}


server.listen(3000, () => {
    console.log('server started on  http://localhost:3000 ');

    MongoClient.connect("mongodb://localhost:27017", function (error, client) {
        database = client.db('my_video_streaming')
        app.post("/signup", function (request, result) {
            database.collection("users").findOne({
                "email": request.body.email
            }, function (error, user) {
                if (user == null) {
                    bcrypt.hash(request.body.password, 10, function (error, hash) {
                        database.collection("users").insertOne({
                            "name": request.body.name,
                            "email": request.body.email,
                            "password": hash,
                            "coverPhoto": "",
                            "image": "",
                            "subscribers": 0,
                            "subscriptions": [],
                            "playlists": [],
                            "videos": [],
                            "history": [],
                            "notifications": []
                        }, function (error, data) {
                            result.render("signup", {
                                "error": "",
                                "message": "Account has been created. Please login now"
                            });
                            res.redirect('/');
                        });

                    });
                } else {
                    result.render("signup", {
                        "error": "Email already exists",
                        "message": ""
                    });
                }
            });
        });


        // LOGIN Get ROUTE
        app.get("/login", function (request, result) {
            result.render("login", {
                "error": "",
                "message": ""
            });
        });

        app.get('/change-pic', function (req, res) {
            res.render("change-pic");
        })

        app.post('/login', function (req, res) {
            //check if email exists

            database.collection("users").findOne({
                "email": req.body.email
            }, function (error, user) {
                if (user == null) { // User not found
                    res.send("email not exist")
                } else {
                    bcrypt.compare(req.body.password, user.password, function (error, isVerify) {
                        if (isVerify) {
                            // password match and save user ID in session
                            req.session.user_id = user._id;
                            res.redirect('/');
                        } else {
                            res.send("Password Not Connect")
                        }
                    })
                }
            })
        })


        app.post("/upload-video", function (request, result) {
            if (request.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.maxFileSize = 1000 * 1024 * 1204;
                formData.parse(request, function (error, fields, files) {
                    var title = fields.title;
                    var description = fields.description;
                    var thumbnail = fields.thumbnailPath;
                    var oldPathThumbnail = files.thumbnail.path;
                    var thumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;

                    fileSystem.rename(oldPathThumbnail, thumbnail, function (error) {
                        //
                    });

                    var oldPath = files.video.path;
                    var newPath = "public/videos/" + new Date().getTime() + "-" + files.video.name;

                    fileSystem.rename(oldPath, newPath, function (error) {

                        getUser(request.session.user_id, function (user) {
                            var currentTime = new Date().getTime();

                            database.collection("videos").insertOne({
                                "user": {
                                    "_id": user._id,
                                    "name": user.name,
                                    "image": user.image,
                                    "subscribers": user.subscribers
                                },
                                "filePath": newPath,
                                "thumbnail": thumbnail,
                                "title": title,
                                "description": description,
                                "category": fields.category,
                                "createdAt": currentTime,
                                "watch": currentTime,
                                "views": 0,
                                "playlist": "",
                                "likers": [],
                                "dislikers": [],
                                "comments": []
                            }, function (error, data) {

                                database.collection("users").updateOne({
                                    "_id": ObjectId(request.session.user_id),
                                }, {
                                    $push: {
                                        "videos": {
                                            "_id": data.insertedId,
                                            "thumbnail": thumbnail,
                                            "title": title,
                                            "views": 0,
                                        }
                                    }
                                });

                                result.redirect("/");
                            });
                        });
                    });

                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/change-profile-picture", function (request, result) {
            if (request.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.parse(request, function (error1, fields, files) {
                    var oldPath = files.image.path;
                    var newPath = "public/profiles/" + request.session.user_id + "-" + files.image.name;

                    fileSystem.rename(oldPath, newPath, function (error2) {

                        database.collection("users").updateOne({
                            "_id": ObjectId(request.session.user_id)
                        }, {
                            $set: {
                                "image": newPath
                            }
                        });

                        database.collection("videos").updateOne({
                            "user._id": ObjectId(request.session.user_id)
                        }, {
                            $set: {
                                "user.image": newPath
                            }
                        });

                        result.redirect("/");
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.get("/search", function (request, result) {
            database.collection("videos").find({
                "title": {
                    $regex: request.query.search_query,
                    $options: "i"
                }
            }).toArray(function (error, videos) {
                result.render("search", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos,
                    "query": request.query.search_query
                });
            });
        });

        app.post("/do-comment", function (request, result) {
            if (request.session.user_id) {
                var comment = request.body.comment;
                var videoId = request.body.videoId;

                getUser(request.session.user_id, function (user) {
                    database.collection("videos").findOneAndUpdate({
                        "_id": ObjectId(videoId)
                    }, {
                        $push: {
                            "comments": {
                                "_id": ObjectId(),
                                "user": {
                                    "_id": user._id,
                                    "name": user.name,
                                    "image": user.image
                                },
                                "comment": comment,
                                "createdAt": new Date().getTime(),
                                "replies": []
                            }
                        }
                    }, function (error1, data) {
                        result.json({
                            "status": "success",
                            "message": "Comment has been posted",
                            "user": {
                                "_id": user._id,
                                "name": user.name,
                                "image": user.image
                            }
                        });
                    });
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please login to perform this action."
                });
            }
        });


        app.get("/category_search/:query", function (request, result) {
            database.collection("videos").find({
                "category": {
                    $regex: ".*?" + request.params.query + ".*?"
                }
            }).toArray(function (error, videos) {
                result.render("search", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos,
                    "query": request.params.query
                });
            });
        });

        app.get("/settings", function (request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function (user) {
                    result.render("settings", {
                        "isLogin": true,
                        "user": user,
                        "request": request.query
                    });
                });
            } else {
                result.redirect("/login");
            }
        });



        app.get("/watch/:watch", function (request, result) {
            database.collection("videos").findOne({
                "watch": parseInt(request.params.watch)
            }, function (error1, video) {
                if (video == null) {
                    result.send("Video does not exist.");
                } else {

                    //Increment Views
                    database.collection("videos").updateOne({
                        "_id": ObjectId(video._id)
                    }, {
                        $inc: {
                            "views": 1
                        }
                    });




                    result.render("video-page/index", {
                        "isLogin": request.session.user_id ? true : false,
                        "video": video
                    });
                }
            });
        });

        app.post("/do-like", function (request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    "_id": ObjectId(request.body.videoId),
                    "likers._id": request.session.user_id
                }, function (error1, video) {
                    if (video == null) {
                        database.collection("videos").updateOne({
                            "_id": ObjectId(request.body.videoId)
                        }, {
                            $push: {
                                "likers": {
                                    "_id": request.session.user_id
                                }
                            }
                        }, function (error2, data) {
                            result.json({
                                "status": "success",
                                "message": "Video has been liked"
                            });
                        });
                    } else {
                        result.json({
                            "status": "error",
                            "message": "You have already liked this video"
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please login to perform this action."
                });
            }
        });

        app.post("/do-dislike", function (request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    "_id": ObjectId(request.body.videoId),
                    "dislikers._id": request.session.user_id
                }, function (error1, video) {
                    if (video == null) {
                        database.collection("videos").updateOne({
                            "_id": ObjectId(request.body.videoId)
                        }, {
                            $push: {
                                "dislikers": {
                                    "_id": request.session.user_id
                                }
                            },
                        }, function (error2, data) {
                            result.json({
                                "status": "success",
                                "message": "Video has been disliked"
                            });
                        });
                    } else {
                        result.json({
                            "status": "error",
                            "message": "You have already disliked this video"
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please login to perform this action."
                });
            }
        });


        app.post("/save_settings", function (request, result) {
            if (request.session.user_id) {
                if (request.body.password == "") {
                    database.collection("users").updateOne({
                        "_id": ObjectId(request.session.user_id)
                    }, {
                        $set: {
                            "name": request.body.name,
                        }
                    });
                } else {
                    bcrypt.hash(request.body.password, 10, function (error1, hash) {
                        database.collection("users").updateOne({
                            "_id": ObjectId(request.session.user_id)
                        }, {
                            $set: {
                                "name": request.body.name,
                                "password": hash
                            }
                        });
                    });
                }

                database.collection("videos").updateMany({
                    "user._id": ObjectId(request.session.user_id)
                }, {
                    $set: {
                        "user.name": request.body.name,
                    }
                }, function (error, data) {
                    result.redirect("/settings?message=success");
                });
            } else {
                result.redirect("/login");
            }
        });















        app.get("/", function (request, result) {
            database.collection("videos").find({}).sort({ "createdAt": -1 }).toArray(function (error, videos) {
                result.render("index", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos
                });
            });
        });


        app.get('/signup', (req, res) => {
            res.render('signup');
        })

        app.get("/logout", function (req, res) {
            req.session.destroy();
            res.redirect("/");
        });

        app.get('/upload', (req, res) => {
            if (req.session.user_id) {
                res.render("upload", {
                    "isLogin": true
                })
            } else {
                res.redirect('/login')
            }
        })



    })





})
