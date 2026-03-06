"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type Language = "id" | "en";

interface Translations {
    [key: string]: {
        [key in Language]: string;
    };
}

const translations: Translations = {
    hero_title: {
        id: "No Code Payment and Commerce Platform for Any Business",
        en: "No Code Payment and Commerce Platform for Any Business"
    },
    hero_subtitle: {
        id: "Jualinaja adalah Super Platform untuk Bisnis yang memudahkan terima pembayaran, atur pengeluaran, dan jualan produk & jasa dalam satu tempat.",
        en: "Jualinaja is a Super Platform for Business that makes it easy to receive payments, manage expenses, and sell products & services in one platform."
    },
    features_title: {
        id: "Satu Platform, Segala Bisnis",
        en: "One Platform, Every Business"
    },
    features_subtitle: {
        id: "Dari jualan barang fisik hingga layanan digital, semua bisa di Jualinaja.",
        en: "From selling physical goods to digital services, everything can be done at Jualinaja."
    },
    btn_merchant: {
        id: "Merchant",
        en: "Merchant"
    },
    btn_customer: {
        id: "Customer",
        en: "Customer"
    },
    pos: {
        id: "Panbayar",
        en: "Panbayar"
    },
    cart_empty: {
        id: "Keranjang Anda kosong",
        en: "Your cart is empty"
    },
    cart_title: {
        id: "Keranjang Anda",
        en: "Your Cart"
    },
    start_shopping: {
        id: "Mulai Belanja",
        en: "Start Shopping"
    }
};

interface LanguageContextProps {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: keyof typeof translations) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguage] = useState<Language>("id");

    const t = (key: keyof typeof translations): string => {
        return translations[key]?.[language] || (key as string);
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
};
