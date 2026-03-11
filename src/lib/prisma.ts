import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
}

const parsedPoolMax = Number(process.env.DB_POOL_MAX ?? "1");
const poolMax = Number.isFinite(parsedPoolMax) && parsedPoolMax > 0 ? parsedPoolMax : 1;

declare global {
    var prisma: PrismaClient | undefined;
    var pgPool: Pool | undefined;
}

const getPool = () => {
    if (globalThis.pgPool) return globalThis.pgPool;

    const pool = new Pool({
        connectionString,
        max: poolMax,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 10_000,
        allowExitOnIdle: process.env.NODE_ENV !== "production",
    });

    pool.on("error", (error) => {
        console.error("Postgres pool error:", error);
    });

    if (process.env.NODE_ENV !== "production") {
        globalThis.pgPool = pool;
    }

    return pool;
};

const createPrismaClient = () => {
    const adapter = new PrismaPg(getPool());
    return new PrismaClient({ adapter });
};

const prisma = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prisma;
}

export default prisma;
