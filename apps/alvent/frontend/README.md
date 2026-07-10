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

## Acceso Local A Login ALVENT

Para ingresar al login sin errores 404 en entorno local:

1. Levanta el backend en `http://127.0.0.1:8000`.
2. Verifica que `.env.local` del frontend tenga `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`.
3. Ejecuta `npm run dev` desde esta carpeta.
4. Abre `http://localhost:3001/login` (o el puerto disponible que muestre Next).

## Produccion

Arquitectura esperada:

- Frontend ALVENT: Vercel, dominio `https://alvent.rensof.pe`.
- Backend ALVENT: Render, dominio `https://alvent-backend.onrender.com`.

Variables de Vercel para el frontend:

```bash
NEXT_PUBLIC_API_URL=https://alvent-backend.onrender.com
NEXT_PUBLIC_APP_BASE_PATH=
```

Las credenciales administrativas se entregan por canal interno y no se publican en el repositorio.
