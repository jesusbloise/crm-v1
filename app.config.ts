// app.config.ts
import 'dotenv/config';

export default {
  expo: {
    name: "CRM",
    slug: "crm-v1",
    scheme: "crmapp",
    extra: {
      // CLIENT ID (tipo Web) de Google para DEV.
      EXPO_PUBLIC_GOOGLE_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    },
  },
};
