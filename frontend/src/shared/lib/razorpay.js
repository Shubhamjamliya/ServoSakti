import { api } from './api';

let loading = null;
const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://checkout.razorpay.com/v1/checkout.js', async: true });
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('Could not load Razorpay. Check your connection and try again.')); };
    document.body.appendChild(s);
  });
  return loading;
};

/**
 * Opens Razorpay Checkout for a payment the server created and confirms it with the server.
 * Resolves with the server's verification result; rejects if the customer closes the window or the payment fails.
 * When the server runs without Razorpay keys (development) it returns `mock: true` and the payment is confirmed directly.
 */
export async function payWith(payment) {
  if (payment.mock) return api('/payments/verify', { method: 'POST', body: { paymentId: payment.paymentId } });
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: payment.keyId,
      order_id: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      prefill: payment.prefill,
      theme: { color: '#1456d8' },
      handler: (res) => api('/payments/verify', { method: 'POST', body: { paymentId: payment.paymentId, ...res } }).then(resolve, reject),
      modal: { ondismiss: () => reject(new Error('Payment was not completed')) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description || 'Payment failed')));
    rzp.open();
  });
}
