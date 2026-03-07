import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const email = String(body?.email || "").trim().toLowerCase();
        const password = String(body?.password || "");

        if (!email || !password) {
            return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
        }

        const user = await prisma.appUser.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, role: true, password: true },
        });

        if (!user || !verifyPassword(password, user.password)) {
            return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
        }

        return NextResponse.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    } catch (error) {
        console.error("Failed to login:", error);
        return NextResponse.json({ error: "Gagal login." }, { status: 500 });
    }
}
