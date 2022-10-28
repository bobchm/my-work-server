const express = require("express");

// taskRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /task.
const taskRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// parse the query attributes into a JSON search object
function validQP(qp) {
    return qp && typeof qp === "string" && qp.length > 0;
}

function parseQuery(reqQuery) {
    var qry = "";
    var any = false;

    if (validQP(reqQuery.completed)) {
        qry += '"completed": ';
        if (reqQuery.completed === "false") {
            qry += "false";
        } else {
            qry += "true";
        }
        any = true;
    }

    if (validQP(reqQuery.due)) {
        if (any) {
            qry += ", ";
        }
        any = true;
        qry += '"due": "' + reqQuery.due + '"';
    }

    if (validQP(reqQuery.item)) {
        if (any) {
            qry += ", ";
        }
        any = true;
        qry += '"item": "' + reqQuery.item + '"';
    }

    if (validQP(reqQuery.recurrence)) {
        if (any) {
            qry += ", ";
        }
        any = true;
        qry += '"recurrence": "' + reqQuery.recurrence + '"';
    }

    if (validQP(reqQuery.taskList)) {
        if (any) {
            qry += ", ";
        }
        any = true;
        qry += '"taskList": "' + reqQuery.taskList + '"';
    }

    // if no fields have been added, make sure 'item' exists so it's a task and not something else
    if (qry.length <= 0) {
        qry = '"emp_age": { $exists: true }';
    }
    return JSON.parse("{" + qry + "}");
}

// This section will help you get a list of all the tasks.
taskRoutes.route("/task").get(function (req, res) {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    let query = parseQuery(req.query);
    db_connect
        .collection("tasks")
        .find(query)
        .toArray(function (err, result) {
            if (err) throw err;
            res.json(result);
        });
});

// This section will help you get a single record by id
taskRoutes.route("/task/:id").get(function (req, res) {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    let myquery = { _id: ObjectId(req.params.id) };
    db_connect.collection("tasks").findOne(myquery, function (err, result) {
        if (err) throw err;
        res.json(result);
    });
});

// This section will help you create a new record.
taskRoutes.route("/task/add").post(function (req, response) {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    let myobj = {
        item: req.body.item,
        due: req.body.due,
        note: req.body.note,
        taskList: req.body.taskList,
        recurrence: req.body.recurrence,
        completed: req.body.completed,
    };
    db_connect.collection("tasks").insertOne(myobj, function (err, res) {
        if (err) throw err;
        addTaskList(req.body.taskList);
        response.json(res);
    });
});

// This section will help you update a record by id.
taskRoutes.route("/update/:id").post(function (req, response) {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }
    let myquery = { _id: ObjectId(req.params.id) };
    let newvalues = {
        $set: {
            item: req.body.item,
            due: req.body.due,
            note: req.body.note,
            taskList: req.body.taskList,
            recurrence: req.body.recurrence,
            completed: req.body.completed,
        },
    };

    // first get the current document to store the task list for possible future deletion
    db_connect.collection("tasks").findOne(myquery, function (err, result) {
        if (err) throw err;
        if (!result) {
            response.json(result);
            return;
        }

        var prevTaskList = result.taskList;
        db_connect
            .collection("tasks")
            .updateOne(myquery, newvalues, function (err, res) {
                if (err) throw err;
                if (prevTaskList !== req.body.taskList) {
                    maybeRemoveTaskList(prevTaskList);
                    addTaskList(req.body.taskList);
                }
                response.json(res);
            });
    });
});

// This section will help you delete a record
taskRoutes.route("/:id").delete((req, response) => {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    let myquery = { _id: ObjectId(req.params.id) };

    // first get the current document to store the task list for possible future deletion
    db_connect.collection("tasks").findOne(myquery, function (err, result) {
        if (err) throw err;
        if (!result) {
            response.json(result);
            return;
        }

        var prevTaskList = result.taskList;
        db_connect.collection("tasks").deleteOne(myquery, function (err, obj) {
            if (err) throw err;
            response.json(obj);
            maybeRemoveTaskList(prevTaskList);
        });
    });
});

// This section gets a list of all lists
taskRoutes.route("/taskLists").get(function (req, res) {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    db_connect
        .collection("tasks")
        .findOne({ allTaskLists: true }, function (err, result) {
            if (err || !result) {
                res.json([]);
            } else {
                res.json(result.taskLists);
            }
        });
});

// add a list
function addTaskList(list) {
    if (!list || list.length <= 0) return;
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    db_connect
        .collection("tasks")
        .findOne({ allTaskLists: true }, function (err, result) {
            if (err) throw err;

            // add if not there
            if (!result) {
                db_connect
                    .collection("tasks")
                    .insertOne(
                        { allTaskLists: true, taskLists: [list] },
                        function (err, res) {
                            if (err) throw err;
                            return;
                        }
                    );
            } else if (!result.taskLists.includes(list)) {
                var newList = result.taskLists;
                newList.push(list);
                var newObj = {
                    $set: { allTaskLists: true, taskLists: newList },
                };
                db_connect
                    .collection("tasks")
                    .updateOne(
                        { _id: result._id },
                        newObj,
                        function (err, res) {
                            if (err) throw err;
                            return;
                        }
                    );
            }
        });
}

// remove a task list if nobody is using it
function maybeRemoveTaskList(list) {
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    let myquery = { taskList: list };
    db_connect.collection("tasks").findOne(myquery, function (err, result) {
        if (err) throw err;
        if (!result) {
            deleteTaskList(list);
        }
    });
}

// delete a task list
function deleteTaskList(list) {
    if (!list || list.length <= 0) return;
    let db_connect = dbo.getDb();

    // is the database ready??
    if (!db_connect) {
        response.status(503).json({ message: "Error - Mongo not ready" });
        console.log("Mongo not ready");
        return;
    }

    db_connect
        .collection("tasks")
        .findOne({ allTaskLists: true }, function (err, result) {
            if (err) return;

            // if not there, just return
            if (!result) return;

            if (result.taskLists.includes(list)) {
                var newList = result.taskLists.filter((tl) => tl !== list);
                var newObj = {
                    $set: { allTaskLists: true, taskLists: newList },
                };
                db_connect
                    .collection("tasks")
                    .updateOne(
                        { _id: result._id },
                        newObj,
                        function (err, res) {
                            if (err) throw err;
                            return;
                        }
                    );
            }
        });
}

module.exports = taskRoutes;
