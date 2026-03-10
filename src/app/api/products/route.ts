import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { buildProductDescription, extractProductMeta, extractProductText, ProductStatus, resolveProductStatus } from '@/lib/product-meta';
import { buildProductSlug, slugify } from '@/lib/public-link';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

const SORT_MAP: Record<string, { field: 'createdAt' | 'price' | 'name'; direction: 'asc' | 'desc' }> = {
    newest: { field: 'createdAt', direction: 'desc' },
    oldest: { field: 'createdAt', direction: 'asc' },
    price_asc: { field: 'price', direction: 'asc' },
    price_desc: { field: 'price', direction: 'desc' },
    name_asc: { field: 'name', direction: 'asc' },
    name_desc: { field: 'name', direction: 'desc' },
};

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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const tenantName = searchParams.get("tenantName");
    const search = searchParams.get("search") || "";
    const searchValue = search.trim();
    const type = searchParams.get("type"); // Fisik, Digital, dll
    const pageParam = Number(searchParams.get("page") || 0);
    const perPageParam = Number(searchParams.get("perPage") || 0);
    const sortKey = searchParams.get("sort") || "newest";
    const sortConfig = SORT_MAP[sortKey] || SORT_MAP.newest;
    const isPaginated = Number.isFinite(pageParam) && Number.isFinite(perPageParam) && pageParam > 0 && perPageParam > 0;

    if (!tenantId) {
        return NextResponse.json({ error: "tenantId wajib diisi." }, { status: 400 });
    }

    try {
        const where: Prisma.PosProductWhereInput = {
            tenantId,
            ...(type ? { type } : {})
        };
        if (searchValue) {
            where.OR = [
                { name: { contains: searchValue, mode: "insensitive" } },
                { barcode: { contains: searchValue, mode: "insensitive" } },
            ];
        }

        if (!searchValue && !type && tenantName) {
            const existingTenant = await prisma.posTenant.findUnique({ where: { id: tenantId } });
            if (existingTenant && existingTenant.name !== tenantName) {
                await prisma.posTenant.update({
                    where: { id: tenantId },
                    data: { name: tenantName },
                });
            }
        }

        if (isPaginated) {
            const total = await prisma.posProduct.count({ where });
            const perPage = Math.max(1, Math.min(50, perPageParam));
            const page = Math.max(1, pageParam);
            const skip = (page - 1) * perPage;

            const items = await prisma.posProduct.findMany({
                where,
                include: { category: true, tenant: { select: { name: true } } },
                orderBy: { [sortConfig.field]: sortConfig.direction },
                skip,
                take: perPage,
            });

            return NextResponse.json({
                items: items.map(formatProduct),
                total,
                page,
                perPage,
                hasMore: skip + items.length < total,
            });
        }

        const products = await prisma.posProduct.findMany({
            where,
            include: { category: true, tenant: { select: { name: true } } },
            orderBy: { [sortConfig.field]: sortConfig.direction }
        });

        return NextResponse.json(products.map(formatProduct));

    } catch (error) {
        console.error("Failed to fetch products:", error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, price, stock, type, categoryId, tenantId, tenantName, tenantEmail, status, statusDate, isPublic, description, imageUrl, barcode } = body;
        if (!tenantId || typeof tenantId !== "string") {
            return NextResponse.json({ error: "tenantId wajib diisi." }, { status: 400 });
        }
        const normalizedBarcode = typeof barcode === "string" ? barcode.trim() : "";
        const normalizedStatus = VALID_STATUS.includes(status) ? status : undefined;
        const normalizedDate = typeof statusDate === "string" && statusDate.trim() ? statusDate : null;
        const parsedStock = Number(stock);
        const effectiveStatus = resolveProductStatus(parsedStock, normalizedStatus, normalizedDate);
        const fullDescription = buildProductDescription(description, {
            status: effectiveStatus,
            statusDate: normalizedDate,
            isPublic: typeof isPublic === "boolean" ? isPublic : true,
        });

        let tenant = await prisma.posTenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            if (!tenantEmail || typeof tenantEmail !== "string") {
                return NextResponse.json({ error: "tenantEmail wajib diisi untuk tenant baru." }, { status: 400 });
            }
            tenant = await prisma.posTenant.create({
                data: {
                    id: tenantId,
                    name: typeof tenantName === "string" && tenantName.trim() ? tenantName.trim() : tenantId,
                    email: tenantEmail.trim().toLowerCase()
                }
            });
        } else if (typeof tenantName === "string" && tenantName.trim() && tenant.name !== tenantName.trim()) {
            tenant = await prisma.posTenant.update({
                where: { id: tenantId },
                data: { name: tenantName.trim() },
            });
        }

        const product = await prisma.posProduct.create({
            data: {
                name,
                price: Number(price),
                stock: parsedStock,
                type,
                categoryId: categoryId || null,
                tenantId,
                barcode: normalizedBarcode || null,
                description: fullDescription,
                imageUrl: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
            }
        });

        const withTenant = await prisma.posProduct.findUnique({
            where: { id: product.id },
            include: { tenant: { select: { name: true } } },
        });

        return NextResponse.json(formatProduct(withTenant || product), { status: 201 });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
            if (target.includes("barcode")) {
                return NextResponse.json({ error: "Barcode sudah dipakai di toko ini." }, { status: 409 });
            }
        }
        console.error("Failed to create product:", error);
        return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }
}
