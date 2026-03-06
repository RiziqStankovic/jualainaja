import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { extractProductMeta, extractProductText, ProductStatus } from "@/lib/product-meta";
import { buildProductSlug, extractUniquePart, slugify } from "@/lib/public-link";

const getProductStatus = (stock: number, status?: ProductStatus | null, statusDate?: string | null): ProductStatus => {
    if (status) return status;
    if (stock <= 0) return "Habis";
    if (statusDate) {
        const date = new Date(statusDate);
        if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) return "Expired";
    }
    return "Aktif";
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: slugOrId } = await context.params;
        const { searchParams } = new URL(request.url);
        const storeParam = (searchParams.get("store") || "").trim().toLowerCase();
        const uniquePart = extractUniquePart(slugOrId);
        const products = await prisma.posProduct.findMany({
            include: { tenant: { select: { name: true } } },
        });
        const product = products.find((item) => item.id.replace(/-/g, "").toLowerCase().startsWith(uniquePart));

        if (!product) {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }

        const storeSlug = slugify(product.tenant?.name || "") || slugify(product.tenantId) || "toko";
        if (storeParam && storeParam !== storeSlug) {
            return NextResponse.json({ error: "Link produk tidak valid." }, { status: 404 });
        }

        const meta = extractProductMeta(product.description);
        const isPublic = meta.isPublic ?? true;
        const status = getProductStatus(product.stock, meta.status || null, meta.statusDate || null);
        if (!isPublic) {
            return NextResponse.json({ error: "Produk tidak tersedia untuk publik." }, { status: 404 });
        }

        const recommendationsRaw = products
            .filter((item) => item.id !== product.id && item.tenantId === product.tenantId)
            .map((item) => {
                const itemMeta = extractProductMeta(item.description);
                return {
                    item,
                    isPublic: itemMeta.isPublic ?? true,
                    status: getProductStatus(item.stock, itemMeta.status || null, itemMeta.statusDate || null),
                };
            })
            .filter((entry) => entry.isPublic && entry.status === "Aktif")
            .slice(0, 4)
            .map((entry) => ({
                id: entry.item.id,
                name: entry.item.name,
                price: entry.item.price,
                imageUrl: entry.item.imageUrl,
                stock: entry.item.stock,
                productSlug: buildProductSlug(entry.item.name, entry.item.id),
            }));

        return NextResponse.json({
            id: product.id,
            productSlug: buildProductSlug(product.name, product.id),
            name: product.name,
            price: product.price,
            stock: product.stock,
            type: product.type,
            imageUrl: product.imageUrl,
            description: extractProductText(product.description),
            status,
            statusDate: meta.statusDate || null,
            isPublic,
            storeName: product.tenant?.name || "Toko",
            storeSlug,
            recommendations: recommendationsRaw,
        });
    } catch (error) {
        console.error("Failed to fetch public product:", error);
        return NextResponse.json({ error: "Failed to fetch public product" }, { status: 500 });
    }
}
