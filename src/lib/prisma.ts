import prismaPkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PrismaClient = (prismaPkg as unknown as { PrismaClient: new (args?: unknown) => any }).PrismaClient;

const prismaClientSingleton = () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set.");
    }

    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
};

declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
