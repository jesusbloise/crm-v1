// app/debug-api.tsx
import { getActiveTenant, getToken } from "@/src/api/auth";
import { getBaseURL } from "@/src/config/baseUrl";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function DebugAPI() {
  const [info, setInfo] = useState<any>(null);

  const runTests = async () => {
    const results: any = {
      timestamp: new Date().toISOString(),
      baseURL: getBaseURL(),
      token: null,
      activeTenant: null,
      meResponse: null,
      tenantsResponse: null,
      errors: [],
    };

    try {
      // 1. Ver token
      results.token = await getToken();
      results.activeTenant = await getActiveTenant();

      // 2. Llamar a /auth/me
      const meRes = await fetch(`${results.baseURL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${results.token}`,
        },
      });
      results.meResponse = {
        status: meRes.status,
        data: await meRes.json(),
      };

      // 3. Llamar a /me/tenants
      const tenantsRes = await fetch(`${results.baseURL}/me/tenants`, {
        headers: {
          Authorization: `Bearer ${results.token}`,
          "X-Tenant-Id": results.activeTenant,
        },
      });
      results.tenantsResponse = {
        status: tenantsRes.status,
        data: await tenantsRes.json(),
      };
    } catch (error: any) {
      results.errors.push(error.message);
    }

    setInfo(results);
  };

  useEffect(() => {
    runTests();
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Debug API" }} />
      
      <ScrollView style={styles.scroll}>
        <Text style={styles.title}>🔍 Debug Info</Text>
        
        <Pressable style={styles.button} onPress={runTests}>
          <Text style={styles.buttonText}>🔄 Refrescar</Text>
        </Pressable>

        {info && (
          <View style={styles.section}>
            <Text style={styles.label}>🌐 Base URL:</Text>
            <Text style={styles.value}>{info.baseURL}</Text>

            <Text style={styles.label}>🔑 Token:</Text>
            <Text style={styles.value} numberOfLines={2}>
              {info.token ? `${info.token.substring(0, 50)}...` : "No token"}
            </Text>

            <Text style={styles.label}>🏢 Active Tenant:</Text>
            <Text style={styles.value}>{info.activeTenant || "No tenant"}</Text>

            <Text style={styles.label}>👤 /auth/me Response:</Text>
            <Text style={styles.code}>
              {JSON.stringify(info.meResponse, null, 2)}
            </Text>

            <Text style={styles.label}>📊 /me/tenants Response:</Text>
            <Text style={styles.code}>
              {JSON.stringify(info.tenantsResponse, null, 2)}
            </Text>

            {info.errors.length > 0 && (
              <>
                <Text style={styles.label}>❌ Errors:</Text>
                {info.errors.map((err: string, i: number) => (
                  <Text key={i} style={styles.error}>{err}</Text>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0c10",
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#7c3aed",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  section: {
    gap: 12,
  },
  label: {
    color: "#22d3ee",
    fontWeight: "bold",
    fontSize: 14,
    marginTop: 12,
  },
  value: {
    color: "#fff",
    fontSize: 14,
    backgroundColor: "#1a1d24",
    padding: 8,
    borderRadius: 4,
  },
  code: {
    color: "#a9b0bd",
    fontSize: 12,
    backgroundColor: "#1a1d24",
    padding: 12,
    borderRadius: 4,
    fontFamily: "monospace",
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    backgroundColor: "#1a1d24",
    padding: 8,
    borderRadius: 4,
  },
});
