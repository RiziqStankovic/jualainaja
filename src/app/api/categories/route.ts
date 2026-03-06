import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    if (!tenantId) {
        return NextResponse.json({ error: "tenantId wajib diisi." }, { status: 400 });
    }

    try {
        const categories = await prisma.posCategory.findMany({
            where: { tenantId },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json(categories);
    } catch (error) {
        console.error("Failed to fetch categories:", error);
        return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, tenantId } = body;
        if (!tenantId || typeof tenantId !== "string") {
            return NextResponse.json({ error: "tenantId wajib diisi." }, { status: 400 });
        }

        const category = await prisma.posCategory.create({
            data: {
                name,
                tenantId
            }
        });

        return NextResponse.json(category, { status: 201 });
    } catch (error) {
        console.error("Failed to create category:", error);
        return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
    }
}
