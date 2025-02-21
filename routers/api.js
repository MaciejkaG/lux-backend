import { jwtVerify } from "jose";
import redis from "../clients/redis.js";
import Id from "../utils/id.js";
import LuxDB from "../utils/lux-db.js";

import express from "express";
const router = express.Router();

router.use((req, res, next) => {
    res.setHeader("Content-Type", "text/plain");
    next();
});
router.use(express.json());

const id = new Id({
    host: process.env.IDDB_HOST,
    user: process.env.IDDB_USER,
    password: process.env.IDDB_PASSWORD,
    database: process.env.IDDB_DATABASE,
});

const luxDb = new LuxDB({
    host: process.env.LUXDB_HOST,
    user: process.env.LUXDB_USER,
    password: process.env.LUXDB_PASSWORD,
    database: process.env.LUXDB_DATABASE,
});
// TODO: Add this user in .env

const requiresAuth = () => async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    let jwt;
    // Check if JWT was provided in the Authorization header.
    if (authHeader && authHeader.startsWith("Bearer ")) {
        jwt = authHeader.substring(7, authHeader.length);
    } else {
        return res
            .status(401)
            .send("Invalid token provided in Authorization header");
    }

    const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);
    let payload;
    try {
        ({ payload } = await jwtVerify(jwt, secret));
    } catch (err) {
        // If JWT format was incorrect or couldn't verify
        return res
            .status(401)
            .send("Invalid token provided in Authorization header");
    }

    // If the JWT is correct, but signed for another app
    if (payload?.appId !== process.env.AUTH_APP_ID) {
        return res
            .status(401)
            .send("Invalid token provided in Authorization header");
    }

    // Assign subject to the request
    req.user = {};
    req.user.sub = payload.sub;

    next();
};

router.get("/users/me", requiresAuth(), async (req, res) => {
    // FIXME: Timeout errors
    const user = await id.getUser(req.user.sub);
    res.send(user);
});

router.get("/friends", requiresAuth(), async (req, res) => {
    const friends = await id.getUserFriends(req.user.sub);
    res.send(friends);
});

router.post("/friends/add", requiresAuth(), async (req, res) => {
    const friendUsername = req.body?.friend_username;

    if (!friendUsername || typeof friendUsername !== "string" || friendUsername.length > 32) {
        return res.status(400).send("Bad friend username");
    }

    let result;
    try {
        result = await id.addFriend(req.user.sub, friendUsername);
    } catch (err) {
        switch (err.message) {
            case "Friend not found":
                return res.status(404).send("Friend not found");

            case "You cannot add yourself as a friend":
                return res.status(400).send("You cannot add yourself as a friend");

            case "You are already friends":
                return res.status(409).send("You are already friends");

            default:
                return res.status(500).send("Unknown error occured");
        }
    }

    res.sendStatus(201);

    const userData = await id.getUser(req.user.sub);
    await redis.publish(
        `${process.env.REDIS_PREFIX}:user_notifications:${result.friend.public_id}`,
        JSON.stringify({
            event: "friend_request",
            data: userData
        })
    );
});

router.post("/friends/remove", requiresAuth(), async (req, res) => {
    const friendPubId = req.body?.friend_public_id;

    if (!friendPubId || typeof friendPubId !== "string" || friendPubId.length !== 36) {
        return res.status(400).send("Bad friend username");
    }

    try {
        await id.removeFriend(req.user.sub, friendPubId);
    } catch (err) {
        switch (err.message) {
            case "Friend not found":
                return res.status(404).send("Friend not found");

            default:
                return res.status(500).send("Unknown error occured");
        }
    }

    res.sendStatus(200);
});

// Game library fetching
router.get("/apps", async (req, res) => {
    const apps = await luxDb.getLibrary();
    res.send(apps);
});

router.get("/apps/:appId", async (req, res) => {
    const app = await luxDb.getApp(req.params.appId);

    if (app === undefined) {
        return res.status(404).send("App not found");
    }

    res.send(app);
});

export default { startingPath: "/api", router }; // Passing the starting path of the router here.
