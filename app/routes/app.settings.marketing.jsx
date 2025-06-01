import { useState, useCallback } from 'react';
import {
  Page, Layout, Card, FormLayout, TextField, Select, Button, Checkbox, BlockStack, Text, Modal, List, LegacyStack, Icon, Banner,
} from '@shopify/polaris';
import { TitleBar } from "@shopify/app-bridge-react";
import { json, redirect } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import {
  getShopChatbotConfig,
  updateShopChatbotConfig,
  getPromotionalMessages,
  createPromotionalMessage,
  updatePromotionalMessage,
  deletePromotionalMessage,
  getPromotionalProducts,
  createPromotionalProduct,
  updatePromotionalProduct,
  deletePromotionalProduct,
} from "../../db.server.js"; // Assuming these are all exported from db.server.js

// ResourcePicker would be imported from '@shopify/app-bridge-react' if used
import { Form as RemixForm, useLoaderData, useActionData, useNavigation, useSubmit, Link } from "@remix-run/react";
import { EditIcon, DeleteIcon } from '@shopify/polaris-icons';


const defaultUtmSettings = {
  utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: ''
};

const defaultMessageData = { id: null, message: '', triggerType: 'FIRST_VISIT', triggerValue: '', isActive: true };
const defaultProductData = { id: null, productId: '', name: '', triggerType: 'RELATED_CATEGORY', triggerValue: '', isActive: true };


export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  try {
    const config = await getShopChatbotConfig(shop);
    const messages = await getPromotionalMessages(shop, false); // Fetch all
    const products = await getPromotionalProducts(shop, false); // Fetch all

    const utmSettings = {
      utmSource: config?.utmSource ?? '',
      utmMedium: config?.utmMedium ?? '',
      utmCampaign: config?.utmCampaign ?? '',
      utmTerm: config?.utmTerm ?? '',
      utmContent: config?.utmContent ?? '',
    };

    return json({
      utmSettings,
      promotionalMessages: messages,
      promotionalProducts: products, // Will use mock for display initially if product name/image not stored
      shopifyShop: shop, // For ResourcePicker
      shopifyApiKey: process.env.SHOPIFY_API_KEY, // For ResourcePicker
      errors: null,
    });
  } catch (error) {
    console.error("Error loading marketing settings:", error);
    return json({
      utmSettings: defaultUtmSettings,
      promotionalMessages: [],
      promotionalProducts: [],
      shopifyShop: shop,
      shopifyApiKey: process.env.SHOPIFY_API_KEY,
      errors: { general: "Failed to load marketing settings." }
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const operation = formData.get("_action");

  try {
    switch (operation) {
      case "saveUtmSettings": {
        const utmSettingsToSave = {
          utmSource: formData.get("utmSource") || null,
          utmMedium: formData.get("utmMedium") || null,
          utmCampaign: formData.get("utmCampaign") || null,
          utmTerm: formData.get("utmTerm") || null,
          utmContent: formData.get("utmContent") || null,
        };
        await updateShopChatbotConfig(shop, utmSettingsToSave);
        return json({ success: true, message: "UTM settings saved." });
      }
      case "createMessage": {
        const messageData = {
          message: formData.get("message"),
          triggerType: formData.get("triggerType"),
          triggerValue: formData.get("triggerValue"),
          isActive: formData.get("isActive") === "on",
        };
        // Add validation here if needed
        if (!messageData.message || !messageData.triggerType) {
          return json({ errors: { message: "Message and Trigger Type are required."}}, { status: 400 });
        }
        await createPromotionalMessage(shop, messageData);
        return json({ success: true, message: "Promotional message created." });
      }
      case "updateMessage": {
        const messageId = formData.get("messageId");
        if (!messageId) return json({ errors: { general: "Message ID missing." }}, { status: 400 });
        const messageData = {
          message: formData.get("message"),
          triggerType: formData.get("triggerType"),
          triggerValue: formData.get("triggerValue"),
          isActive: formData.get("isActive") === "on",
        };
        if (!messageData.message || !messageData.triggerType) {
         return json({ errors: { message: "Message and Trigger Type are required."}}, { status: 400 });
        }
        await updatePromotionalMessage(messageId, shop, messageData);
        return json({ success: true, message: "Promotional message updated." });
      }
      case "deleteMessage": {
        const messageId = formData.get("messageId");
        if (!messageId) return json({ errors: { general: "Message ID missing." }}, { status: 400 });
        await deletePromotionalMessage(messageId, shop);
        return json({ success: true, message: "Promotional message deleted." });
      }
      // Placeholder Product Actions
      case "createProduct":
        console.log("Attempting to create product with data:", Object.fromEntries(formData));
        return json({ success: true, message: "Product creation placeholder hit." });
      case "updateProduct":
        console.log("Attempting to update product with data:", Object.fromEntries(formData));
        return json({ success: true, message: "Product update placeholder hit." });
      case "deleteProduct":
        console.log("Attempting to delete product with ID:", formData.get("promotionalProductId"));
        return json({ success: true, message: "Product deletion placeholder hit." });
      default:
        return json({ errors: { general: "Unknown action." }}, { status: 400 });
    }
  } catch (error) {
    console.error(`Error in marketing settings action (${operation}):`, error);
    return json({ errors: { general: error.message || "An error occurred." }}, { status: 500 });
  }
};


export default function MarketingSettingsPage() {
  const { utmSettings: loadedUtm, promotionalMessages, promotionalProducts: loadedProducts, shopifyShop, shopifyApiKey, errors: loaderErrors } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSaving = navigation.state === "submitting" && navigation.formData?.get("_action") === "saveUtmSettings";
  const isMessageModalSaving = navigation.state === "submitting" &&
    (navigation.formData?.get("_action") === "createMessage" || navigation.formData?.get("_action") === "updateMessage");
  // const isProductModalSaving = ... (similar logic for product modal)


  // Combine loader and action errors/success messages for display
  const pageFeedback = actionData || loaderErrors;


  // UTM States
  const [utmSettings, setUtmSettings] = useState(loadedUtm || defaultUtmSettings);
  // Update UTM state if loader data changes (e.g., after save)
  useState(() => { // Using a simple effect-like behavior with useState's initializer
    setUtmSettings(loadedUtm || defaultUtmSettings);
  }, [loadedUtm]);


  const handleUtmChange = useCallback((value, field) => {
    setUtmSettings(prev => ({ ...prev, [field]: value }));
  }, []);

  // Promotional Message States
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [currentMessageData, setCurrentMessageData] = useState(defaultMessageData);

  // Promotional Product States - using mock for display for now
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [currentProductData, setCurrentProductData] = useState(defaultProductData);
  const MOCK_PROMOTIONAL_PRODUCTS = loadedProducts && loadedProducts.length > 0 ? loadedProducts : [ // Use loaded if available
    { id: 'prod1', productId: 'gid://shopify/Product/123', name: 'Awesome T-Shirt (Mock)', triggerType: 'RELATED_CATEGORY', triggerValue: 'Apparel', isActive: true },
  ];


  const triggerTypeOptions = [
    { label: 'First Visit', value: 'FIRST_VISIT' },
    { label: 'Cart Abandonment Attempt', value: 'CART_ABANDONMENT_ATTEMPT' }, // User is about to leave the site
    { label: 'Page URL Contains', value: 'PAGE_URL' }, // Specific URL or path
    { label: 'Time on Site (seconds)', value: 'TIME_ON_SITE' }, // e.g., after 60 seconds
  ];

  const productTriggerTypeOptions = [
    { label: 'Related to Category (Manual)', value: 'RELATED_CATEGORY' }, // Admin specifies a category string
    { label: 'On Cart Page', value: 'ON_CART_PAGE' }, // When chat opened on cart page
    { label: 'Time-based Campaign (Manual)', value: 'TIME_CAMPAIGN' }, // Admin specifies campaign name/dates
  ];

  // Handlers for Promotional Messages Modal
  const handleOpenNewMessageModal = useCallback(() => {
    setEditingMessage(null);
    setCurrentMessageData(defaultMessageData);
    setMessageModalOpen(true);
  }, []);

  const handleOpenEditMessageModal = useCallback((message) => {
    setEditingMessage(message);
    setCurrentMessageData({ ...message, isActive: message.isActive === undefined ? true : message.isActive });
    setMessageModalOpen(true);
  }, []);

  const handleMessageModalClose = useCallback(() => setMessageModalOpen(false), []);

  const handleMessageDataChange = useCallback((value, field) => {
    setCurrentMessageData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleMessageFormSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", editingMessage ? "updateMessage" : "createMessage");
    if (editingMessage) {
      formData.append("messageId", editingMessage.id);
    }
    formData.append("message", currentMessageData.message);
    formData.append("triggerType", currentMessageData.triggerType);
    formData.append("triggerValue", currentMessageData.triggerValue || "");
    formData.append("isActive", currentMessageData.isActive ? "on" : ""); // "on" or empty for checkbox
    submit(formData, { method: "post" });
    handleMessageModalClose();
  }, [editingMessage, currentMessageData, submit]);

  const handleDeleteMessage = useCallback((id) => {
    if (!confirm("Are you sure you want to delete this promotional message?")) return;
    const formData = new FormData();
    formData.append("_action", "deleteMessage");
    formData.append("messageId", id);
    submit(formData, { method: "post" });
  }, [submit]);

  // Handlers for Promotional Products Modal (placeholders for now)
  const handleOpenNewProductModal = useCallback(() => {
    setEditingProduct(null);
    setCurrentProductData(defaultProductData);
    setProductModalOpen(true);
  }, []);

  const handleOpenEditProductModal = useCallback((product) => {
    setEditingProduct(product);
    setCurrentProductData({ ...product, isActive: product.isActive === undefined ? true : product.isActive });
    setProductModalOpen(true);
  }, []);

  const handleProductModalClose = useCallback(() => setProductModalOpen(false), []);

  const handleProductDataChange = useCallback((value, field) => {
    setCurrentProductData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleProductFormSubmit = useCallback(() => {
    // This will be fully implemented later
    console.log("Submitting product (placeholder):", currentProductData);
    const formData = new FormData();
    formData.append("_action", editingProduct ? "updateProduct" : "createProduct");
     if (editingProduct) {
      formData.append("promotionalProductId", editingProduct.id);
    }
    formData.append("productId", currentProductData.productId);
    formData.append("triggerType", currentProductData.triggerType);
    formData.append("triggerValue", currentProductData.triggerValue || "");
    formData.append("isActive", currentProductData.isActive ? "on" : "");
    submit(formData, {method: "post"});
    handleProductModalClose();
  }, [editingProduct, currentProductData, submit]);

  const handleDeleteProduct = useCallback((id) => {
    if (!confirm("Are you sure you want to delete this promotional product?")) return;
    console.log("Deleting product (placeholder):", id);
    const formData = new FormData();
    formData.append("_action", "deleteProduct");
    formData.append("promotionalProductId", id);
    submit(formData, {method: "post"});
  }, [submit]);


  return (
    <Page title="Marketing & Promotional Settings">
      <TitleBar title="Marketing Settings" />
      {pageFeedback?.general && (
        <Layout.Section>
          <Banner title={pageFeedback.success ? "Success" : "Error"} tone={pageFeedback.success ? "success" : "critical"} onDismiss={() => { /* Can't clear actionData here directly */ }}>{pageFeedback.general || pageFeedback.message}</Banner>
        </Layout.Section>
      )}
       {actionData?.message && !actionData?.errors && ( // General success message from actions
        <Layout.Section>
            <Banner title="Success" tone="success" onDismiss={() => {}}>{actionData.message}</Banner>
        </Layout.Section>
      )}


      <Layout>
        <Layout.Section>
          <RemixForm method="post">
            <input type="hidden" name="_action" value="saveUtmSettings" />
            <BlockStack gap="500">
              <Card title="Default UTM Parameters for Generated Links">
                <BlockStack gap="300" padding="400">
                  <Text tone="subdued" as="p">Define default UTM parameters to be appended to product links shared by the chatbot.</Text>
                  <FormLayout>
                    <TextField label="UTM Source" name="utmSource" value={utmSettings.utmSource} onChange={(val) => handleUtmChange(val, 'utmSource')} autoComplete="off" error={actionData?.errors?.utmSource} />
                    <TextField label="UTM Medium" name="utmMedium" value={utmSettings.utmMedium} onChange={(val) => handleUtmChange(val, 'utmMedium')} autoComplete="off" error={actionData?.errors?.utmMedium} />
                    <TextField label="UTM Campaign" name="utmCampaign" value={utmSettings.utmCampaign} onChange={(val) => handleUtmChange(val, 'utmCampaign')} autoComplete="off" error={actionData?.errors?.utmCampaign} />
                    <TextField label="UTM Term" name="utmTerm" value={utmSettings.utmTerm} onChange={(val) => handleUtmChange(val, 'utmTerm')} autoComplete="off" error={actionData?.errors?.utmTerm} />
                    <TextField label="UTM Content" name="utmContent" value={utmSettings.utmContent} onChange={(val) => handleUtmChange(val, 'utmContent')} autoComplete="off" error={actionData?.errors?.utmContent} />
                  </FormLayout>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 'var(--p-space-400)'}}>
                    <Button submit primary loading={isSaving}>Save UTM Settings</Button>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </RemixForm>
        </Layout.Section>

        <Layout.Section>
          <Card title="Promotional Messages">
            <div style={{padding: 'var(--p-space-400)'}}>
                <BlockStack gap="300">
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={handleOpenNewMessageModal} primary>Add New Message</Button>
                </div>
                {promotionalMessages && promotionalMessages.length > 0 ? (
                    <List>
                    {promotionalMessages.map((msg) => (
                        <List.Item key={msg.id}>
                          <LegacyStack distribution="equalSpacing" alignment="center">
                              <BlockStack gap="100">
                                  <Text variant="bodyMd" fontWeight="bold">{msg.message.substring(0,50)}{msg.message.length > 50 ? '...' : ''}</Text>
                                  <Text tone="subdued">Trigger: {msg.triggerType} {msg.triggerValue ? `(${msg.triggerValue})` : ''}</Text>
                              </BlockStack>
                              <LegacyStack alignment="center" spacing="tight">
                                  <Text>{msg.isActive ? "Active" : "Inactive"}</Text>
                                  <Button icon={EditIcon} accessibilityLabel="Edit message" onClick={() => handleOpenEditMessageModal(msg)} />
                                  <Button icon={DeleteIcon} accessibilityLabel="Delete message" destructive onClick={() => handleDeleteMessage(msg.id)} />
                              </LegacyStack>
                          </LegacyStack>
                        </List.Item>
                    ))}
                    </List>
                ) : (
                    <Text alignment="center" tone="subdued">No promotional messages configured yet.</Text>
                )}
                </BlockStack>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Promotional Products">
             <div style={{padding: 'var(--p-space-400)'}}>
                <BlockStack gap="300">
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button onClick={handleOpenNewProductModal} primary>Add Promotional Product</Button>
                    </div>
                    {MOCK_PROMOTIONAL_PRODUCTS && MOCK_PROMOTIONAL_PRODUCTS.length > 0 ? ( // Using mock for now
                    <List>
                        {MOCK_PROMOTIONAL_PRODUCTS.map((prod) => (
                        <List.Item key={prod.id}>
                            <LegacyStack distribution="equalSpacing" alignment="center">
                                <BlockStack gap="100">
                                    <Text variant="bodyMd" fontWeight="bold">{prod.name || prod.productId}</Text>
                                    <Text tone="subdued">Trigger: {prod.triggerType} {prod.triggerValue ? `(${prod.triggerValue})` : ''}</Text>
                                </BlockStack>
                                <LegacyStack alignment="center" spacing="tight">
                                    <Text>{prod.isActive ? "Active" : "Inactive"}</Text>
                                    <Button icon={EditIcon} accessibilityLabel="Edit product" onClick={() => handleOpenEditProductModal(prod)} />
                                    <Button icon={DeleteIcon} accessibilityLabel="Delete product" destructive onClick={() => handleDeleteProduct(prod.id)} />
                                </LegacyStack>
                            </LegacyStack>
                        </List.Item>
                        ))}
                    </List>
                    ) : (
                    <Text alignment="center" tone="subdued">No promotional products configured yet.</Text>
                    )}
                </BlockStack>
            </div>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Promotional Message Modal */}
      <Modal
        open={messageModalOpen}
        onClose={handleMessageModalClose}
        title={editingMessage ? "Edit Promotional Message" : "Add New Promotional Message"}
        primaryAction={{ content: 'Save Message', onAction: handleMessageFormSubmit, loading: isMessageModalSaving }}
        secondaryActions={[{ content: 'Cancel', onAction: handleMessageModalClose }]}
      >
        <Modal.Section>
            <RemixForm method="post" onSubmit={(e) => { e.preventDefault(); handleMessageFormSubmit(); }}>
              <FormLayout>
                <input type="hidden" name="_action" value={editingMessage ? "updateMessage" : "createMessage"} />
                {editingMessage && <input type="hidden" name="messageId" value={editingMessage.id} />}
                <TextField label="Message" name="message" value={currentMessageData.message} onChange={(val) => handleMessageDataChange(val, 'message')} multiline={4} autoComplete="off" error={actionData?.errors?.message} />
                <Select label="Trigger Type" name="triggerType" options={triggerTypeOptions} value={currentMessageData.triggerType} onChange={(val) => handleMessageDataChange(val, 'triggerType')} error={actionData?.errors?.triggerType} />
                {(currentMessageData.triggerType === 'PAGE_URL' || currentMessageData.triggerType === 'TIME_ON_SITE') && (
                  <TextField label="Trigger Value" name="triggerValue" value={currentMessageData.triggerValue || ""} onChange={(val) => handleMessageDataChange(val, 'triggerValue')} autoComplete="off" helpText={currentMessageData.triggerType === 'PAGE_URL' ? 'e.g., /products/specific-item or part of URL' : 'e.g., 60 (for seconds on site)'} error={actionData?.errors?.triggerValue} />
                )}
                <Checkbox label="Active" name="isActive" checked={currentMessageData.isActive} onChange={(val) => handleMessageDataChange(val, 'isActive')} />
              </FormLayout>
            </RemixForm>
        </Modal.Section>
      </Modal>

      {/* Promotional Product Modal */}
      <Modal
        open={productModalOpen}
        onClose={handleProductModalClose}
        title={editingProduct ? "Edit Promotional Product" : "Add New Promotional Product"}
        primaryAction={{ content: 'Save Product', onAction: handleProductFormSubmit, loading: false /* TODO: isProductModalSaving */ }}
        secondaryActions={[{ content: 'Cancel', onAction: handleProductModalClose }]}
      >
        <Modal.Section>
           <RemixForm method="post" onSubmit={(e) => { e.preventDefault(); handleProductFormSubmit(); }}>
            <FormLayout>
                <input type="hidden" name="_action" value={editingProduct ? "updateProduct" : "createProduct"} />
                {editingProduct && <input type="hidden" name="promotionalProductId" value={editingProduct.id} />}
                <TextField label="Shopify Product GID" name="productId" value={currentProductData.productId} onChange={(val) => handleProductDataChange(val, 'productId')} autoComplete="off" helpText="e.g., gid://shopify/Product/1234567890." error={actionData?.errors?.productId} />
                {/* <Button onClick={() => console.log('ResourcePicker for Products to be implemented here using shopifyShop and shopifyApiKey from loaderData')}>Select Product with ResourcePicker</Button> */}
                <Select label="Trigger Type" name="triggerType" options={productTriggerTypeOptions} value={currentProductData.triggerType} onChange={(val) => handleProductDataChange(val, 'triggerType')} error={actionData?.errors?.triggerType} />
                {(currentProductData.triggerType === 'RELATED_CATEGORY' || currentProductData.triggerType === 'TIME_CAMPAIGN') && (
                    <TextField label="Trigger Value" name="triggerValue" value={currentProductData.triggerValue || ""} onChange={(val) => handleProductDataChange(val, 'triggerValue')} autoComplete="off" helpText={currentProductData.triggerType === 'RELATED_CATEGORY' ? 'e.g., "Apparel" or "Summer Collection"' : 'e.g., "Holiday2024"'} error={actionData?.errors?.triggerValue} />
                )}
                <Checkbox label="Active" name="isActive" checked={currentProductData.isActive} onChange={(val) => handleProductDataChange(val, 'isActive')} />
            </FormLayout>
           </RemixForm>
        </Modal.Section>
      </Modal>

    </Page>
  );
}
