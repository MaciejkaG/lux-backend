// Lux Database API v. 1.0.0

import mysql from "mysql2/promise";

export default class LuxDB {
    constructor(mysqlOptions) {
        this.pool = mysql.createPool(mysqlOptions);
    }

    async getLibrary() {
        const [results] = await this.pool.query(
            "SELECT app_id, display_name FROM apps;"
        );
        return results;
    }

    async getApp(appId) {
        if (!appId || typeof appId !== "string" || appId.length > 256) return undefined;

        const [results] = await this.pool.query(
            "SELECT display_name, description, archives, latest_tag FROM apps WHERE app_id = ?;",
            [appId]
        );

        if (results.length === 0) {
            return undefined;
        }

        const result = results[0];
        return { ...result, archives: JSON.parse(result.archives) };
    }
}