import { createClient } from "redis";

const client = await createClient()
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

export default client;
