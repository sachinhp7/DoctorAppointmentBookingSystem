// utils/paypalClient.js
import checkoutNodeJssdk from '@paypal/checkout-server-sdk';

function environment() {
    let clientId = process.env.PAYPAL_CLIENT_ID;
    let clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (process.env.PAYPAL_MODE === "live") {
        return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
    } else {
        return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
    }
}

function client() {
    return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

export default { client };
