// mcjk id API v. 1.0.0

import mysql from "mysql2/promise";

export default class Id {
    constructor(mysqlOptions) {
        this.pool = mysql.createPool(mysqlOptions);
    }

    async getUser(sub) {
        const [results] = await this.pool.query(
            "SELECT created_at, display_name, user_name FROM users WHERE user_id = ?;",
            [sub]
        );
        return results[0];
    }

    async getUserFriends(sub) {
        const friendsListQuery = `SELECT u.display_name, u.user_name FROM friendships f JOIN users u ON (CASE WHEN f.user1 = ? THEN f.user2 ELSE f.user1 END) = u.user_id WHERE f.active_since IS NOT NULL AND (user1 = ? OR user2 = ?);`;
        const friendRequestsQuery = `SELECT u.display_name, u.user_name, (CASE WHEN f.user1 = ? THEN 0 ELSE 1 END) AS incoming FROM friendships f JOIN users u ON (CASE WHEN f.user1 = ? THEN f.user2 ELSE f.user1 END) = u.user_id WHERE f.active_since IS NULL AND (f.user1 = ? OR f.user2 = ?) ORDER BY incoming DESC;`;

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
}