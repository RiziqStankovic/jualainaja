"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Store, Package, User } from "lucide-react";
import styles from "./BottomNav.module.css";
import AddProductButton from "./AddProductButton";

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className={styles.navContainer}>
            <Link href="/" className={`${styles.navItem} ${pathname === "/" ? styles.navItemActive : ""}`}>
                <div className={styles.iconWrapper}>
                    <Home size={22} strokeWidth={pathname === "/" ? 2.5 : 2} />
                </div>
                <span>Home</span>
            </Link>

            <Link href="/pos" className={`${styles.navItem} ${pathname === "/pos" ? styles.navItemActive : ""}`}>
                <div className={styles.iconWrapper}>
                    <Store size={22} strokeWidth={pathname === "/pos" ? 2.5 : 2} />
                </div>
                <span>POS</span>
            </Link>

            <AddProductButton />

            <Link href="/products" className={`${styles.navItem} ${pathname === "/products" ? styles.navItemActive : ""}`}>
                <div className={styles.iconWrapper}>
                    <Package size={22} strokeWidth={pathname === "/products" ? 2.5 : 2} />
                </div>
                <span>Product</span>
            </Link>

            <Link href="/account" className={`${styles.navItem} ${pathname === "/account" ? styles.navItemActive : ""}`}>
                <div className={styles.iconWrapper}>
                    <User size={22} strokeWidth={pathname === "/account" ? 2.5 : 2} />
                </div>
                <span>Account</span>
            </Link>
        </nav>
    );
}
