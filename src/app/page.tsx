"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./page.module.css";
import { Languages, ShieldCheck, Box, Download, Briefcase, Ticket, LogOut, Store, Package } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearSessionUser, getSessionUser, getUsers, saveUsers, setSessionUser, SessionUser } from "@/lib/local-auth";

export default function LandingPage() {
  const { language, setLanguage, t } = useLanguage();
  const [authType, setAuthType] = useState<"merchant" | "customer">("merchant");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionUser, setSessionUserState] = useState<SessionUser | null>(() => getSessionUser());
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "register" || requestedMode === "login") {
      setAuthMode(requestedMode);
    }
  }, [searchParams]);

  const toggleLanguage = () => {
    setLanguage(language === "id" ? "en" : "id");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    try {
      if (authMode === "register") {
        if (!name.trim() || !emailOrPhone.trim() || !password.trim()) {
          setErrorMsg("Nama, email, dan password wajib diisi.");
          return;
        }

        if (password.length < 6) {
          setErrorMsg("Password minimal 6 karakter.");
          return;
        }

        const users = getUsers();
        const email = emailOrPhone.trim().toLowerCase();
        const exists = users.some((u) => u.email === email);
        if (exists) {
          setErrorMsg("Email sudah terdaftar.");
          return;
        }

        users.push({
          name: name.trim(),
          email,
          password,
          role: authType,
        });
        saveUsers(users);

        setAuthMode("login");
        setName("");
        setPassword("");
        setErrorMsg("Register berhasil. Silakan login.");
        return;
      }

      const users = getUsers();
      const email = emailOrPhone.trim().toLowerCase();
      const matched = users.find((u) => u.email === email && u.password === password);
      if (!matched) {
        setErrorMsg("Email atau password salah / akun belum terdaftar.");
        return;
      }
      const loggedInUser: SessionUser = {
        name: matched.name,
        email: matched.email,
        role: matched.role,
      };
      setSessionUser(loggedInUser);
      setSessionUserState(loggedInUser);

      if (matched.role === "merchant") {
        router.push(redirectTo || "/pos");
      } else {
        router.push(redirectTo || "/products");
      }
    } catch {
      setErrorMsg("Terjadi gangguan jaringan/server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearSessionUser();
    setSessionUserState(null);
    setEmailOrPhone("");
    setPassword("");
    setName("");
    setErrorMsg("");
  };

  if (sessionUser) {
    return (
      <div className={styles.landingContainer}>
        <header className={styles.header}>
          <div className={styles.logo}>Jualinaja</div>
          <button className={styles.langSwitch} onClick={toggleLanguage}>
            <Languages size={18} />
            {language.toUpperCase()}
          </button>
        </header>

        <div className={styles.hero}>
          <div className={styles.loginIcon}>
            <div className={styles.shieldIcon}>
              <ShieldCheck size={32} strokeWidth={2.5} />
            </div>
          </div>
          <h1 className={styles.heroTitle}>Selamat Datang, {sessionUser.name}</h1>
          <p className={styles.heroSubtitle}>
            Anda login sebagai {sessionUser.role === "merchant" ? "Merchant" : "Customer"} ({sessionUser.email})
          </p>
        </div>

        <section className={styles.featuresSection}>
          <div className={styles.featuresHeader}>
            <h2 className={styles.featuresTitle}>Dashboard Home</h2>
            <p className={styles.featuresSubtitle}>Pilih menu utama sesuai kebutuhan Anda.</p>
          </div>

          <div className={styles.cardsGrid}>
            <button className={`${styles.featureCard} ${styles.physical}`} onClick={() => router.push("/pos")}>
              <div className={styles.iconBox} style={{ color: "#2563eb" }}>
                <Store size={24} />
              </div>
              <h3 className={styles.cardTitle}>Masuk POS</h3>
              <p className={styles.cardDesc}>Kelola transaksi dan keranjang penjualan.</p>
            </button>

            <button className={`${styles.featureCard} ${styles.digital}`} onClick={() => router.push("/products")}>
              <div className={styles.iconBox} style={{ color: "#1d4ed8" }}>
                <Package size={24} />
              </div>
              <h3 className={styles.cardTitle}>Kelola Produk</h3>
              <p className={styles.cardDesc}>Atur stok, kategori, dan daftar produk.</p>
            </button>

            <button className={`${styles.featureCard} ${styles.service}`} onClick={() => router.push("/account")}>
              <div className={styles.iconBox} style={{ color: "#0f766e" }}>
                <ShieldCheck size={24} />
              </div>
              <h3 className={styles.cardTitle}>Akun Saya</h3>
              <p className={styles.cardDesc}>Lihat data akun login dan pengaturan profil.</p>
            </button>

            <button className={`${styles.featureCard} ${styles.event}`} onClick={handleLogout}>
              <div className={styles.iconBox} style={{ color: "#dc2626" }}>
                <LogOut size={24} />
              </div>
              <h3 className={styles.cardTitle}>Logout</h3>
              <p className={styles.cardDesc}>Keluar dari sesi saat ini dengan aman.</p>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.landingContainer}>
      <header className={styles.header}>
        <div className={styles.logo}>Jualinaja</div>
        <button className={styles.langSwitch} onClick={toggleLanguage}>
          <Languages size={18} />
          {language.toUpperCase()}
        </button>
      </header>

      <div className={styles.hero}>
        <div className={styles.loginSwitcher}>
          <button
            className={`${styles.switcherBtn} ${authType === "merchant" ? styles.switcherBtnActive : ""}`}
            onClick={() => setAuthType("merchant")}
          >
            {t("btn_merchant")}
          </button>
          <button
            className={`${styles.switcherBtn} ${authType === "customer" ? styles.switcherBtnActive : ""}`}
            onClick={() => setAuthType("customer")}
          >
            {t("btn_customer")}
          </button>
        </div>

        <div className={styles.loginIcon}>
          <div className={styles.shieldIcon}>
            <ShieldCheck size={32} strokeWidth={2.5} />
          </div>
        </div>

        <h1 className={styles.heroTitle}>{t("hero_title")}</h1>
        <p className={styles.heroSubtitle}>{t("hero_subtitle")}</p>
      </div>

      <form className={styles.authForm} onSubmit={handleLogin}>
        {authMode === "register" && (
          <div className={styles.inputGroup}>
            <label>Nama</label>
            <input
              type="text"
              className={styles.inputField}
              placeholder="Masukkan nama Anda"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div className={styles.inputGroup}>
          <label>Email</label>
          <input
            type="email"
            className={styles.inputField}
            placeholder="Masukkan email Anda"
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            required
          />
        </div>
        <div className={styles.inputGroup}>
          <label>Password</label>
          <input
            type="password"
            className={styles.inputField}
            placeholder="Masukkan password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {errorMsg && (
          <p style={{ color: errorMsg.toLowerCase().includes("berhasil") ? "#059669" : "#dc2626", fontSize: 13, marginTop: -4 }}>
            {errorMsg}
          </p>
        )}
        <button type="submit" className={styles.loginBtn}>
          {isSubmitting
            ? "Memproses..."
            : authMode === "login"
              ? `Masuk sebagai ${authType === "merchant" ? "Merchant" : "Customer"}`
              : `Daftar sebagai ${authType === "merchant" ? "Merchant" : "Customer"}`}
        </button>
        <button
          type="button"
          className={styles.switcherBtn}
          style={{ marginTop: 10, width: "100%" }}
          onClick={() => {
            setAuthMode((prev) => (prev === "login" ? "register" : "login"));
            setErrorMsg("");
          }}
        >
          {authMode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Login"}
        </button>
      </form>

      <section className={styles.featuresSection}>
        <div className={styles.featuresHeader}>
          <h2 className={styles.featuresTitle}>{t("features_title")}</h2>
          <p className={styles.featuresSubtitle}>{t("features_subtitle")}</p>
        </div>

        <div className={styles.cardsGrid}>
          <div className={`${styles.featureCard} ${styles.physical}`}>
            <div className={styles.iconBox} style={{ color: '#2563eb' }}>
              <Box size={24} />
            </div>
            <h3 className={styles.cardTitle}>Barang Fisik</h3>
            <p className={styles.cardDesc}>Makanan, fashion, gadget, dan lainnya.</p>
          </div>

          <div className={`${styles.featureCard} ${styles.digital}`}>
            <div className={styles.iconBox} style={{ color: '#9333ea' }}>
              <Download size={24} />
            </div>
            <h3 className={styles.cardTitle}>Produk Digital</h3>
            <p className={styles.cardDesc}>E-book, voucher, kode game, kursus.</p>
          </div>

          <div className={`${styles.featureCard} ${styles.service}`}>
            <div className={styles.iconBox} style={{ color: '#16a34a' }}>
              <Briefcase size={24} />
            </div>
            <h3 className={styles.cardTitle}>Jasa & Layanan</h3>
            <p className={styles.cardDesc}>Freelance, konsultasi, reparasi.</p>
          </div>

          <div className={`${styles.featureCard} ${styles.event}`}>
            <div className={styles.iconBox} style={{ color: '#ea580c' }}>
              <Ticket size={24} />
            </div>
            <h3 className={styles.cardTitle}>Event & Tiket</h3>
            <p className={styles.cardDesc}>Webinar, workshop, gathering.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
