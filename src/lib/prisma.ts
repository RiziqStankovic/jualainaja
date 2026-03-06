import prismaPkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PrismaClient = (prismaPkg as unknown as { PrismaClient: new (args?: unknown) => any }).PrismaClient;

const prismaClientSingleton = () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set.");
    }

    const parsedPoolMax = Number(process.env.DB_POOL_MAX ?? "2");
    const max = Number.isFinite(parsedPoolMax) && parsedPoolMax > 0 ? parsedPoolMax : 2;
    const adapter = new PrismaPg({
        connectionString,
        // Keep pool small to avoid Supabase session-mode max-clients errors.
        max,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
        allowExitOnIdle: process.env.NODE_ENV !== "production",
    });
    return new PrismaClient({ adapter });
};

declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
