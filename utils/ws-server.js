import { WebSocketServer } from "ws";
import redis from "../clients/redis.js";
import Id from "../utils/id.js";

import { jwtVerify } from "jose";

const id = new Id({
    host: process.env.IDDB_HOST,
    user: process.env.IDDB_USER,
    password: process.env.IDDB_PASSWORD,
    database: process.env.IDDB_DATABASE,
});

const allowedStatuses = ["lux", "projecto-playing"];

export default async function initWS(server) {
    // Clear all presence data from Redis on startup
    const presenceKeys = await redis.keys(`${process.env.REDIS_PREFIX}:user_presence:*`);
    if (presenceKeys.length > 0) {
        await redis.del(...presenceKeys);
    }

    const wss = new WebSocketServer({ server });

    wss.on("connection", async (ws, req) => {
        const pubsub = redis.duplicate();
        await pubsub.connect();

        try {
            ws.sub = await auth(req);
        } catch (err) {
            if (err.message === "Invalid token provided") {
                ws.close(
                    3000,
                    "Invalid token provided in Authorization header"
                );
                return;
            } else throw err;
        }

        console.log("WebSocket client connected and authenticated");
        const user = await id.getUser(ws.sub);
        ws.publicId = user.public_id;

        const sendJSON = (payload, destination = ws) => {
            destination.send(JSON.stringify(payload));
        };

        pubsub.subscribe(
            `${process.env.REDIS_PREFIX}:user_notifications:${ws.publicId}`,
            (message) => {
                message = JSON.parse(message);
                switch (message?.event) {
                    case "friend_request":
                        sendJSON(message);
                        break;
                    case "friend_deleted":
                        const friendPubId = message.public_id;
                        // TODO: Finish friend deleted action + unsubscribe their status
                        break;
                }
            }
        );

        // Update presence in Redis and publish event
        const setPresence = async (online, status = "") => {
            // Update presence in Redis and publish event
            const presenceData = {
                online,
                status,
            };

            await redis.json.set(
                `${process.env.REDIS_PREFIX}:user_presence:${ws.publicId}`,
                "$",
                presenceData
            );
            await redis.publish(
                `${process.env.REDIS_PREFIX}:user_presence:${ws.publicId}`,
                JSON.stringify(presenceData)
            );
        };

        await setPresence(true, "");

        // Fetch current presence of friends and send it to the client
        const refreshFriendSubscriptions = async () => {
            let friendsList;
            try {
                ({ friendsList } = await id.getUserFriends(ws.sub));
            } catch (err) {
                if (err?.code === "ETIMEDOUT") {
                    return;
                }
            }
            const newFriendIds = friendsList.map((f) => f.public_id);

            if (ws.subscribedFriends) {
                const removedFriends = ws.subscribedFriends.filter(
                    (id) => !newFriendIds.includes(id)
                );
                for (const removedFriend of removedFriends) {
                    await pubsub.unsubscribe(
                        `${process.env.REDIS_PREFIX}:user_presence:${removedFriend}`
                    );
                }
            }

            ws.subscribedFriends = newFriendIds;
            const presenceUpdates = [];

            for (const friend of friendsList) {
                const { public_id: publicId } = friend;
                const presence = await redis.json.get(
                    `${process.env.REDIS_PREFIX}:user_presence:${publicId}`
                );
                if (presence) {
                    presenceUpdates.push({
                        friend_id: publicId,
                        online: presence.online,
                        status: presence.status,
                    });
                } else {
                    presenceUpdates.push({
                        friend_id: publicId,
                        online: false,
                        status: "",
                    });
                }

                await pubsub.subscribe(
                    `${process.env.REDIS_PREFIX}:user_presence:${publicId}`,
                    (message) => {
                        message = JSON.parse(message);
                        sendJSON({
                            event: "friend_presence_update",
                            data: {
                                friend_id: publicId,
                                online: message.online ? true : false,
                                status: message.status,
                            },
                        });
                    }
                );
            }

            // Send the collected presence updates
            sendJSON({
                event: "full_friend_presence",
                data: presenceUpdates,
            });
        };

        await refreshFriendSubscriptions();
        setInterval(refreshFriendSubscriptions, 60000);

        ws.on("message", async (message) => {
            try {
                message = JSON.parse(message);
            } catch (err) {
                return;
            }

            switch (message?.action) {
                case "presence_update":
                    const status = message?.data?.status;
                    if (
                        typeof status !== "string" ||
                        !allowedStatuses.includes(status)
                    )
                        return;

                    setPresence(true, status);
                    break;

                // TODO: Handle friend requests
            }
        });

        console.log("WebSocket ready to receive messages");
        sendJSON({ event: "listening", data: {} });

        ws.on("close", async () => {
            console.log("WebSocket client disconnected");

            // Close the Redis Pub/Sub connection
            await pubsub.quit();

            setPresence(false, "");
        });
    });
}

async function auth(req) {
    const authHeader = req.headers["authorization"];
    let jwt;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        jwt = authHeader.substring(7, authHeader.length);
    } else {
        throw new Error("Invalid token provided");
    }

    const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);
    let payload;
    try {
        ({ payload } = await jwtVerify(jwt, secret));
    } catch (err) {
        throw new Error("Invalid token provided");
    }

    if (payload?.appId !== process.env.AUTH_APP_ID) {
        throw new Error("Invalid token provided");
    }

    return payload.sub;
}
