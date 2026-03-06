import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { extractProductMeta, ProductStatus } from "@/lib/product-meta";

type CheckoutItem = {
    id: string;
    quantity: number;
};

type TxClient = {
    posProduct: typeof prisma.posProduct;
};

function getProductStatus(stock: number, description?: string | null): ProductStatus {
    const meta = extractProductMeta(description);
    if (meta.status) return meta.status;
    if (stock <= 0) return "Habis";
    if (meta.statusDate) {
        const date = new Date(meta.statusDate);
        if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) {
            return "Expired";
        }
    }
    return "Aktif";
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const items = (body?.items || []) as CheckoutItem[];

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "Item checkout tidak valid." }, { status: 400 });
        }

        const normalizedItems = items
            .map((item) => ({
                id: String(item.id || "").trim(),
                quantity: Number(item.quantity),
            }))
            .filter((item) => item.id && Number.isFinite(item.quantity) && item.quantity > 0);

        if (normalizedItems.length !== items.length) {
            return NextResponse.json({ error: "Item checkout tidak valid." }, { status: 400 });
        }

        const updatedProducts = await prisma.$transaction(async (tx: TxClient) => {
            for (const item of normalizedItems) {
                const product = await tx.posProduct.findUnique({
                    where: { id: item.id },
                    select: { name: true, stock: true, description: true },
                });

                if (!product) {
                    throw new Error("Produk tidak ditemukan.");
                }

                const status = getProductStatus(product.stock, product.description);
                if (status !== "Aktif") {
                    throw new Error(`${product.name} status ${status} dan tidak bisa dibeli.`);
                }

                const result = await tx.posProduct.updateMany({
                    where: { id: item.id, stock: { gte: item.quantity } },
                    data: { stock: { decrement: item.quantity } },
                });

                if (result.count === 0) {
                    throw new Error(`${product.name} stok tidak cukup. Stok tersedia: ${product.stock}.`);
                }
            }

            return tx.posProduct.findMany({
                where: { id: { in: normalizedItems.map((item) => item.id) } },
                select: { id: true, stock: true },
            });
        });

        return NextResponse.json({
            success: true,
            updatedProducts,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Checkout gagal.";
        if (message.toLowerCase().includes("stok tidak cukup") || message.toLowerCase().includes("tidak bisa dibeli")) {
            return NextResponse.json({ error: message }, { status: 409 });
        }
        console.error("Checkout failed:", error);
        return NextResponse.json({ error: "Checkout gagal." }, { status: 500 });
    }
}
