import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const name = String(body?.name || "").trim();
        const email = String(body?.email || "").trim().toLowerCase();
        const password = String(body?.password || "");
        const role = body?.role === "merchant" ? "merchant" : body?.role === "customer" ? "customer" : "";

        if (!name || !email || !password || !role) {
            return NextResponse.json({ error: "Nama, email, password, dan role wajib diisi." }, { status: 400 });
        }
        if (password.length < 6) {
            return NextResponse.json({ error: "Password minimal 6 karakter." }, { status: 400 });
        }

        const existing = await prisma.appUser.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
        }

        const user = await prisma.appUser.create({
            data: {
                name,
                email,
                password: hashPassword(password),
                role,
            },
            select: { id: true, name: true, email: true, role: true },
        });

        return NextResponse.json(user, { status: 201 });
    } catch (error) {
        console.error("Failed to register:", error);
        return NextResponse.json({ error: "Gagal register." }, { status: 500 });
    }
}
