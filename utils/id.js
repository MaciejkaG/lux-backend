// mcjk id API v. 1.0.0

import mysql from "mysql2/promise";

export default class Id {
    constructor(mysqlOptions) {
        this.pool = mysql.createPool(mysqlOptions);
    }

    async getUser(sub) {
        const [results] = await this.pool.query(
            "SELECT created_at, display_name, user_name, public_id FROM users WHERE user_id = ?;",
            [sub]
        );
        return results[0];
    }

    async getUserFriends(sub) {
        const friendsListQuery = `SELECT u.display_name, u.user_name, u.public_id FROM friendships f JOIN users u ON (CASE WHEN f.user1 = ? THEN f.user2 ELSE f.user1 END) = u.user_id WHERE f.active_since IS NOT NULL AND (user1 = ? OR user2 = ?);`;
        const friendRequestsQuery = `SELECT u.display_name, u.user_name, u.public_id, (CASE WHEN f.user1 = ? THEN 0 ELSE 1 END) AS incoming FROM friendships f JOIN users u ON (CASE WHEN f.user1 = ? THEN f.user2 ELSE f.user1 END) = u.user_id WHERE f.active_since IS NULL AND (f.user1 = ? OR f.user2 = ?) ORDER BY incoming DESC;`;

        const [friendsList] = await this.pool.query(friendsListQuery, [
            sub,
            sub,
            sub,
        ]);
        const [friendRequests] = await this.pool.query(friendRequestsQuery, [
            sub,
            sub,
            sub,
            sub,
        ]);

        return { friendsList, friendRequests };
    }

    async addFriend(userSub, friendUsername) {
        // Check if the friend exists
        const [friendResult] = await this.pool.query(
            "SELECT user_id FROM users WHERE user_name = ?;",
            [friendUsername]
        );

        if (friendResult.length === 0) {
            throw new Error("Friend not found");
        }

        const friendSub = friendResult[0].user_id;
        if (friendSub === userSub) {
            throw new Error("You cannot add yourself as a friend");
        }

        // Check if a friendship already exists
        const [existingFriendship] = await this.pool.query(
            "SELECT user1, active_since FROM friendships WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?);",
            [userSub, friendSub, friendSub, userSub]
        );

        if (existingFriendship.length > 0) {
            const friendship = existingFriendship[0];
            if (friendship.active_since) {
                throw new Error("You are already friends");
            }

            // Activate existing friendship
            await this.pool.query(
                "UPDATE friendships SET active_since = NOW() WHERE user1 = ? AND user2 = ?;",
                [friendSub, userSub]
            );
        } else {
            // Create new friendship entry
            await this.pool.query(
                "INSERT INTO friendships (user1, user2, active_since) VALUES (?, ?, NULL);",
                [userSub, friendSub]
            );
        }

        const friendData = await this.getUser(friendSub);
        return {
            success: true,
            message: "Friend request sent",
            friend: friendData,
        };
    }

    async removeFriend(userSub, friendPubId) {
        // Check if the friend exists
        const [friendResult] = await this.pool.query(
            "SELECT user_id FROM users WHERE public_id = ?;",
            [friendPubId]
        );

        if (friendResult.length === 0) {
            throw new Error("Friend not found");
        }

        const friendSub = friendResult[0].user_id;

        // Remove or revoke friendship
        await this.pool.query(
            "DELETE FROM friendships WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?);",
            [userSub, friendSub, friendSub, userSub]
        );

        return { success: true, message: "Friend removed or request revoked" };
    }
}