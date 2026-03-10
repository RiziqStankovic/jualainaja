This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Desktop WebView Wrapper (Electron)

Run wrapper for production URL:

```bash
npm run desktop
```

Run wrapper pointing to local dev server (`http://localhost:3000`):

```bash
npm run dev
# in another terminal
npm run desktop:local
```

## Build Installer `.exe` (Production)

Install dependency once:

```bash
npm install
```

Build Windows installer + portable executable:

```bash
npm run desktop:dist
```

Output file location:

- `release/JualinAja-<version>-x64.exe` (NSIS installer)
- `release/JualinAja-<version>-x64-portable.exe` (portable, no install)

Recommended release flow for real users:

1. Update version in `package.json` (example: `0.1.1`).
2. Run `npm run desktop:dist`.
3. Upload files in `release/` to GitHub Releases (or your download server).
4. Share only that release link to users.

Notes:

- First run on Windows may show SmartScreen warning if app is not code signed.
- For cleaner trust/UX in production, sign the app with an EV/OV code-signing certificate.
- If build fails with `Cannot create symbolic link` in `winCodeSign`, use the updated script:
  - `npm run desktop:dist`
  - It disables auto certificate discovery and skips executable signing/editing step.
  - Alternative: run terminal as Administrator or enable Windows Developer Mode.
- To remove `default Electron icon is used`, add your icon at `desktop-wrapper/icon.ico` then set `"icon": "desktop-wrapper/icon.ico"` under `build.win` in `package.json`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
