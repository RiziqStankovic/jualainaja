import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildProductDescription, extractProductMeta, extractProductText, ProductStatus } from "@/lib/product-meta";
import { buildProductSlug, slugify } from "@/lib/public-link";

const VALID_STATUS: ProductStatus[] = ["Aktif", "Habis", "Hold", "Expired", "Tidak Aktif"];

const formatProduct = <T extends { description?: string | null; tenant?: { name?: string | null } | null; tenantId?: string }>(product: T) => {
    const meta = extractProductMeta(product.description);
    const storeSlug = slugify(product.tenant?.name || "") || slugify(product.tenantId || "") || "toko";
    return {
        ...product,
        description: extractProductText(product.description),
        status: meta.status || null,
        statusDate: meta.statusDate || null,
        isPublic: meta.isPublic ?? true,
        storeSlug,
        productSlug: buildProductSlug((product as { name?: string }).name || "produk", (product as { id?: string }).id || ""),
    };
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
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
        if (!id) {
            return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
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

        if (body?.description !== undefined || body?.status !== undefined || body?.statusDate !== undefined || body?.isPublic !== undefined) {
            const product = await prisma.posProduct.findUnique({
                where: { id },
                select: { description: true },
            });

            if (!product) {
                return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
            }

            const currentMeta = extractProductMeta(product.description);
            const currentText = extractProductText(product.description);
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

            updateData.description = buildProductDescription(
                typeof body?.description === "string" ? body.description : currentText,
                {
                status: requestedStatus === undefined ? currentMeta.status : requestedStatus,
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
