import { useState, useCallback, useEffect } from 'react';
import { Page, Layout, Card, FormLayout, Select, TextField, Button, Banner } from '@shopify/polaris';
import { TitleBar } from "@shopify/app-bridge-react";
import { Form as RemixForm, useLoaderData, useActionData, useNavigation, json } from "@remix-run/react";
import { authenticate } from "../../shopify.server";
import { redirect } from "@remix-run/node";
import { getAppConfiguration, updateAppConfiguration } from "../../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const appConfig = await getAppConfiguration(shop);

  if (appConfig && appConfig.error) {
    console.error("Error loading app configuration:", appConfig.error);
    // Return a default config but include an error message for the UI
    return json({
      llmProvider: 'gemini',
      geminiApiKey: '',
      claudeApiKey: '',
      error: "Failed to load configuration. Please try again."
    });
  }

  // Ensure a default structure if no config exists, and ensure keys are not null for controlled components
  return json(appConfig || {
    llmProvider: 'gemini', // Default provider if nothing is set
    geminiApiKey: '',
    claudeApiKey: ''
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();

  const llmProvider = formData.get('llmProvider');
  // Ensure API keys are passed as empty strings if not provided or explicitly cleared,
  // as updateAppConfiguration expects strings or null.
  const geminiApiKey = formData.get('geminiApiKey') || "";
  const claudeApiKey = formData.get('claudeApiKey') || "";

  try {
    await updateAppConfiguration(shop, { llmProvider, geminiApiKey, claudeApiKey });
    // Optionally, you could return a success message via useActionData
    return redirect("/app/settings/ai", {
      // headers: { "X-Remix-Reload-Document": "true" } // To force data reload if needed
    });
  } catch (error) {
    console.error("Failed to update app configuration:", error);
    // Return an error message to display in the UI
    return json({ error: "Failed to save settings. Please try again." }, { status: 500 });
  }
};

export default function AISettingsPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  // Initialize state from loaderData, ensuring keys are never null for TextField
  const [llmProvider, setLlmProvider] = useState(loaderData?.llmProvider || 'gemini');
  const [geminiApiKey, setGeminiApiKey] = useState(loaderData?.geminiApiKey || '');
  const [claudeApiKey, setClaudeApiKey] = useState(loaderData?.claudeApiKey || '');

  // Update state if loaderData changes (e.g., after form submission and redirect)
  useEffect(() => {
    if (loaderData) {
      setLlmProvider(loaderData.llmProvider || 'gemini');
      setGeminiApiKey(loaderData.geminiApiKey || '');
      setClaudeApiKey(loaderData.claudeApiKey || '');
    }
  }, [loaderData]);

  const handleLlmProviderChange = useCallback((value) => setLlmProvider(value), []);
  const handleGeminiApiKeyChange = useCallback((value) => setGeminiApiKey(value), []);
  const handleClaudeApiKeyChange = useCallback((value) => setClaudeApiKey(value), []);

  const llmProviderOptions = [
    { label: 'Gemini', value: 'gemini' },
    { label: 'Claude', value: 'claude' },
  ];

  const isSubmitting = navigation.state === "submitting";
  const pageError = loaderData?.error || actionData?.error;

  return (
    <Page>
      <TitleBar title="AI Settings" />
      <Layout>
        {pageError && (
          <Layout.Section>
            <Banner title="Error" tone="critical" onDismiss={() => { /* Clear error if needed */ }}>
              <p>{pageError}</p>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <BlockStack gap="400" padding="400"> {/* Added BlockStack for padding and gap */}
              <RemixForm method="post">
                <FormLayout>
                  <Select
                    label="LLM Provider"
                  name="llmProvider"
                  options={llmProviderOptions}
                  onChange={handleLlmProviderChange}
                  value={llmProvider}
                  helpText="Choose your preferred Large Language Model provider. API keys for the selected provider must be configured below."
                />
                {llmProvider === 'gemini' && (
                  <TextField
                    label="Gemini API Key"
                    name="geminiApiKey"
                    type="password"
                    value={geminiApiKey}
                    onChange={handleGeminiApiKeyChange}
                    autoComplete="new-password"
                    helpText="Enter your Gemini API key. This is kept confidential. Leave blank if you do not want to use Gemini or to clear an existing key."
                  />
                )}
                {llmProvider === 'claude' && (
                  <TextField
                    label="Claude API Key"
                    name="claudeApiKey"
                    type="password"
                    value={claudeApiKey}
                    onChange={handleClaudeApiKeyChange}
                    autoComplete="new-password"
                    helpText="Enter your Claude API key. This is kept confidential. Leave blank if you do not want to use Claude or to clear an existing key."
                  />
                )}
                  <Button submit primary loading={isSubmitting}>
                    Save Settings
                  </Button>
                </FormLayout>
              </RemixForm>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
