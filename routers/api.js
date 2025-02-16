import { jwtVerify } from "jose";
import Id from "../utils/id.js";

import express from "express";
const router = express.Router();

const id = new Id({
    host: process.env.IDDB_HOST,
    user: process.env.IDDB_USER,
    password: process.env.IDDB_PASSWORD,
    database: process.env.IDDB_DATABASE,
})

const requiresAuth = () => async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    let jwt;
    // Check if JWT was provided in the Authorization header.
    if (authHeader.startsWith("Bearer ")) {
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
    } finally {
        // If the JWT is correct, but signed for another app
        if (payload?.appId !== process.env.AUTH_APP_ID) {
            return res
                .status(401)
                .send("Invalid token provided in Authorization header");
        }
    }

    // Assign subject to the request
    req.user = {};
    req.user.sub = payload.sub;

    next();
};

router.get("/users/me", requiresAuth(), async (req, res) => {
    const user = await id.getUser(req.user.sub);
    res.send(user);
});

export default { startingPath: "/api", router }; // Passing the starting path of the router here.
