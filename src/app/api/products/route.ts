import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildProductDescription, extractProductMeta, extractProductText, ProductStatus } from '@/lib/product-meta';
import { buildProductSlug, slugify } from '@/lib/public-link';

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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") || "default-tenant"; // Hardcoded for demo
    const tenantName = searchParams.get("tenantName") || "Toko Jualinaja";
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type"); // Fisik, Digital, dll
    const pageParam = Number(searchParams.get("page") || 0);
    const perPageParam = Number(searchParams.get("perPage") || 0);
    const sortKey = searchParams.get("sort") || "newest";
    const sortConfig = SORT_MAP[sortKey] || SORT_MAP.newest;
    const isPaginated = Number.isFinite(pageParam) && Number.isFinite(perPageParam) && pageParam > 0 && perPageParam > 0;

    try {
        const where = {
            tenantId,
            name: {
                contains: search,
                mode: 'insensitive' as const,
            },
            ...(type ? { type } : {})
        };

        if (!search && !type) {
            if (tenantName) {
                const existingTenant = await prisma.posTenant.findUnique({ where: { id: tenantId } });
                if (existingTenant && existingTenant.name !== tenantName) {
                    await prisma.posTenant.update({
                        where: { id: tenantId },
                        data: { name: tenantName },
                    });
                }
            }
            const currentCount = await prisma.posProduct.count({ where: { tenantId } });
            if (currentCount === 0) {
            let tenant = await prisma.posTenant.findUnique({ where: { id: tenantId } });
            if (!tenant) {
                tenant = await prisma.posTenant.create({
                    data: {
                        id: tenantId,
                        name: tenantName,
                        email: `tenant-${tenantId}@jualinaja.local`,
                    }
                });
            }

            await prisma.posProduct.createMany({
                data: [
                    { tenantId: tenant.id, name: "Kopi Susu Literan", price: 45000, stock: 18, type: "Fisik" },
                    { tenantId: tenant.id, name: "E-book Resep UMKM", price: 75000, stock: 999, type: "Digital" },
                    { tenantId: tenant.id, name: "Jasa Desain Logo", price: 250000, stock: 12, type: "Jasa" },
                ],
                skipDuplicates: true,
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
        const { name, price, stock, type, categoryId, tenantId = "default-tenant", tenantName, status, statusDate, isPublic, description, imageUrl } = body;
        const normalizedStatus = VALID_STATUS.includes(status) ? status : undefined;
        const normalizedDate = typeof statusDate === "string" && statusDate.trim() ? statusDate : null;
        const fullDescription = buildProductDescription(description, {
            status: normalizedStatus,
            statusDate: normalizedDate,
            isPublic: typeof isPublic === "boolean" ? isPublic : true,
        });

        // Ensure tenant exists for demo purposes
        let tenant = await prisma.posTenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            tenant = await prisma.posTenant.create({
                data: {
                    id: tenantId,
                    name: typeof tenantName === "string" && tenantName.trim() ? tenantName.trim() : "Toko Jualinaja",
                    email: `tenant-${tenantId}@jualinaja.local`
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
                stock: Number(stock),
                type,
                categoryId: categoryId || null,
                tenantId,
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
        console.error("Failed to create product:", error);
        return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }
}
