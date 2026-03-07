import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildProductDescription, extractProductMeta, extractProductText, ProductStatus, resolveProductStatus } from "@/lib/product-meta";
import { buildProductSlug, slugify } from "@/lib/public-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS: ProductStatus[] = ["Aktif", "Habis", "Hold", "Expired", "Tidak Aktif"];

const formatProduct = <T extends { description?: string | null; tenant?: { name?: string | null } | null; tenantId?: string }>(product: T) => {
    const meta = extractProductMeta(product.description);
    const storeSlug = slugify(product.tenant?.name || "") || slugify(product.tenantId || "") || "toko";
    const effectiveStatus = resolveProductStatus(
        Number((product as { stock?: number }).stock ?? 0),
        meta.status || null,
        meta.statusDate || null
    );
    return {
        ...product,
        description: extractProductText(product.description),
        status: effectiveStatus,
        statusDate: meta.statusDate || null,
        isPublic: meta.isPublic ?? true,
        storeSlug,
        productSlug: buildProductSlug((product as { name?: string }).name || "produk", (product as { id?: string }).id || ""),
    };
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get("tenantId");
        if (!id) {
            return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
        }

        const product = await prisma.posProduct.findUnique({
            where: { id },
            include: { tenant: { select: { name: true } } },
        });
        if (!product) {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }
        if (tenantId && product.tenantId !== tenantId) {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }

        return NextResponse.json(formatProduct(product));
    } catch (error) {
        console.error("Failed to fetch product detail:", error);
        return NextResponse.json({ error: "Failed to fetch product detail" }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const body = await request.json();
        const tenantId = typeof body?.tenantId === "string" ? body.tenantId : undefined;
        if (!id) {
            return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
        }

        const ownedProduct = await prisma.posProduct.findUnique({
            where: { id },
            select: { id: true, tenantId: true, description: true, stock: true },
        });
        if (!ownedProduct) {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }
        if (tenantId && ownedProduct.tenantId !== tenantId) {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }

        const updateData: {
            name?: string;
            type?: string;
            price?: number;
            stock?: number;
            description?: string | null;
            imageUrl?: string | null;
        } = {};

        if (typeof body?.name === "string") {
            const normalizedName = body.name.trim();
            if (!normalizedName) {
                return NextResponse.json({ error: "Nama produk tidak valid." }, { status: 400 });
            }
            updateData.name = normalizedName;
        }

        if (typeof body?.type === "string" && body.type.trim()) {
            updateData.type = body.type.trim();
        }
        if (body?.imageUrl !== undefined) {
            updateData.imageUrl =
                typeof body.imageUrl === "string" && body.imageUrl.trim()
                    ? body.imageUrl.trim()
                    : null;
        }

        if (body?.price !== undefined) {
            const price = Number(body.price);
            if (Number.isNaN(price) || price < 0) {
                return NextResponse.json({ error: "Harga tidak valid." }, { status: 400 });
            }
            updateData.price = price;
        }

        if (body?.stock !== undefined) {
            const stock = Number(body.stock);
            if (Number.isNaN(stock) || stock < 0) {
                return NextResponse.json({ error: "Stok tidak valid." }, { status: 400 });
            }
            updateData.stock = stock;
        }

        if (body?.description !== undefined || body?.status !== undefined || body?.statusDate !== undefined || body?.isPublic !== undefined || body?.stock !== undefined) {
            const currentMeta = extractProductMeta(ownedProduct.description);
            const currentText = extractProductText(ownedProduct.description);
            const requestedStatus =
                body?.status === null || body?.status === ""
                    ? undefined
                    : VALID_STATUS.includes(body?.status)
                        ? body.status
                        : null;

            if (requestedStatus === null) {
                return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
            }

            const statusDate =
                typeof body?.statusDate === "string" && body.statusDate.trim()
                    ? body.statusDate
                    : body?.statusDate === null || body?.statusDate === ""
                        ? null
                        : currentMeta.statusDate || null;
            const isPublic =
                typeof body?.isPublic === "boolean"
                    ? body.isPublic
                    : currentMeta.isPublic ?? true;
            const nextStock = updateData.stock ?? ownedProduct.stock;
            const effectiveStatus = resolveProductStatus(
                Number(nextStock),
                requestedStatus === undefined ? currentMeta.status : requestedStatus,
                statusDate
            );

            updateData.description = buildProductDescription(
                typeof body?.description === "string" ? body.description : currentText,
                {
                    status: effectiveStatus,
                    statusDate,
                    isPublic,
                }
            );
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "Tidak ada data yang diupdate." }, { status: 400 });
        }

        const updated = await prisma.posProduct.update({
            where: { id },
            data: updateData,
            include: { tenant: { select: { name: true } } },
        });

        return NextResponse.json(formatProduct(updated));
    } catch (error) {
        console.error("Failed to update product:", error);
        return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
    }
}
