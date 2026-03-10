import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DEFAULT_RECEIPT_TEMPLATE, PaperWidth } from "@/lib/receipt-template";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizePaperWidth = (value: unknown): PaperWidth => (value === "80mm" ? "80mm" : "58mm");
const isMissingColumnError = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = String(searchParams.get("email") || "").trim().toLowerCase();
        if (!email) {
            return NextResponse.json({ error: "Email wajib diisi." }, { status: 400 });
        }

        let user: { printTemplate: string | null; printPaperWidth: string | null } | null = null;
        try {
            user = await prisma.appUser.findUnique({
                where: { email },
                select: { printTemplate: true, printPaperWidth: true },
            });
        } catch (error) {
            if (!isMissingColumnError(error)) throw error;

            const userExists = await prisma.appUser.findUnique({
                where: { email },
                select: { id: true },
            });
            if (!userExists) {
                return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
            }

            return NextResponse.json({
                printTemplate: DEFAULT_RECEIPT_TEMPLATE,
                paperWidth: "58mm",
                persisted: false,
                warning: "Kolom print settings belum tersedia di database. Jalankan migrasi Prisma.",
            });
        }

        if (!user) {
            return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
        }

        return NextResponse.json({
            printTemplate: user.printTemplate || DEFAULT_RECEIPT_TEMPLATE,
            paperWidth: normalizePaperWidth(user.printPaperWidth),
        });
    } catch (error) {
        console.error("Failed to get print settings:", error);
        return NextResponse.json({ error: "Gagal mengambil pengaturan print." }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const email = String(body?.email || "").trim().toLowerCase();
        const templateRaw = body?.printTemplate;
        const widthRaw = body?.paperWidth;

        if (!email) {
            return NextResponse.json({ error: "Email wajib diisi." }, { status: 400 });
        }

        const data: { printTemplate?: string; printPaperWidth?: PaperWidth } = {};
        if (typeof templateRaw === "string") {
            data.printTemplate = templateRaw.slice(0, 12000);
        }
        if (widthRaw != null) {
            data.printPaperWidth = normalizePaperWidth(widthRaw);
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "Tidak ada perubahan data." }, { status: 400 });
        }

        try {
            const updated = await prisma.appUser.update({
                where: { email },
                data,
                select: { printTemplate: true, printPaperWidth: true },
            });

            return NextResponse.json({
                success: true,
                printTemplate: updated.printTemplate || DEFAULT_RECEIPT_TEMPLATE,
                paperWidth: normalizePaperWidth(updated.printPaperWidth),
            });
        } catch (error) {
            if (!isMissingColumnError(error)) throw error;

            const userExists = await prisma.appUser.findUnique({
                where: { email },
                select: { id: true },
            });
            if (!userExists) {
                return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
            }

            return NextResponse.json({
                success: true,
                persisted: false,
                warning: "Kolom print settings belum tersedia di database. Jalankan migrasi Prisma.",
                printTemplate:
                    typeof data.printTemplate === "string" && data.printTemplate.length > 0
                        ? data.printTemplate
                        : DEFAULT_RECEIPT_TEMPLATE,
                paperWidth: normalizePaperWidth(data.printPaperWidth),
            });
        }
    } catch (error) {
        console.error("Failed to update print settings:", error);
        return NextResponse.json({ error: "Gagal menyimpan pengaturan print." }, { status: 500 });
    }
}
