import assert from 'assert';
import sequelize from '../config/db.js';
import ServiceBooking from '../modules/service_booking/service_booking.model.js';
import ServiceBookingTimeline from '../modules/service_booking/service_booking_timeline.model.js';
import * as razorpayService from '../modules/service_booking/razorpay.service.js';
import * as serviceBookingService from '../modules/service_booking/service_booking.service.js';

const testResults = [];
const recordTest = (name, passed, details = '') => {
  testResults.push({ name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} ${name}${details ? ` -> ${details}` : ''}`);
};

async function runTests() {
  console.log('\n===============================================================');
  console.log('🚀 ENTERPRISE TEST SUITE: Service Booking Razorpay Integration');
  console.log('===============================================================\n');

  let testBooking = null;

  try {
    // ── Test 1: Razorpay Config & Key Retrieval ──────────────────────────────
    console.log('[Phase 1] Razorpay Config & Key Verification');
    const keyId = razorpayService.getRazorpayKeyId();
    assert(keyId && typeof keyId === 'string', 'Razorpay key ID must be a non-empty string');
    recordTest('Razorpay Config Key Retrieval', true, `Key: ${keyId}`);

    // ── Test 2: Direct Razorpay Order Creation via Service ───────────────────
    console.log('\n[Phase 2] Direct Razorpay Order Creation');
    const rzpOrder = await razorpayService.createRazorpayOrder({
      amount: 499.00,
      currency: 'INR',
      receipt: `test_srv_rcpt_${Date.now()}`,
      notes: { purpose: 'enterprise_test' },
    });
    assert(rzpOrder.id, 'Razorpay order must contain an id');
    assert.strictEqual(rzpOrder.amount, 49900, 'Paise amount must equal 49900');
    assert.strictEqual(rzpOrder.currency, 'INR');
    recordTest('Razorpay Order Creation Engine', true, `Order ID: ${rzpOrder.id}`);

    // ── Test 3: Signature Verification (Valid, Invalid, Sandbox) ─────────────
    console.log('\n[Phase 3] Signature Verification Security & Sandbox Bypass');
    const sandboxCheck = razorpayService.verifyRazorpayPaymentSignature({
      razorpay_order_id: 'order_dev_12345678',
      razorpay_payment_id: 'pay_dev_87654321',
      razorpay_signature: 'any_signature',
    });
    assert.strictEqual(sandboxCheck.isValid, true);
    assert.strictEqual(sandboxCheck.is_sandbox, true);
    recordTest('Sandbox/Dev Signature Verification Bypass', true, 'Handled seamlessly');

    const invalidCheck = razorpayService.verifyRazorpayPaymentSignature({
      razorpay_order_id: 'order_live_99999',
      razorpay_payment_id: 'pay_live_88888',
      razorpay_signature: 'invalid_sha256_hash',
    });
    assert.strictEqual(invalidCheck.isValid, false);
    recordTest('Live Invalid Signature Rejection', true, invalidCheck.message);

    // ── Test 4: Seed a real ServiceBooking in Database ────────────────────────
    console.log('\n[Phase 4] Database ServiceBooking Payment Lifecycle');
    const testRef = `SG-SRV-TEST-${Date.now().toString().slice(-4)}`;
    testBooking = await ServiceBooking.create({
      booking_reference: testRef,
      status: 'confirmed',
      amount: 650.00,
      payment_mode: 'cod',
      payment_status: 'pending',
      service_address: 'Flat 402, Block B, Test Green Society',
      time_slot: '10:00 AM - 12:00 PM',
      scheduled_at: new Date(),
    });
    assert(testBooking.id, 'Test booking must be created in DB');
    recordTest('Seed Service Booking in DB', true, `ID: ${testBooking.id}, Ref: ${testRef}`);

    // ── Test 5: createRazorpayOrderForService for existing booking ───────────
    console.log('\n[Phase 5] createRazorpayOrderForService Authoritative Amount');
    const bookingOrder = await serviceBookingService.createRazorpayOrderForService({
      booking_id: testBooking.id,
    });
    assert.strictEqual(bookingOrder.amount, 65000, 'Authoritative amount must be 65000 paise');
    assert.strictEqual(bookingOrder.booking_id, testBooking.id);

    const reloadedBookingAfterOrder = await ServiceBooking.findByPk(testBooking.id);
    assert.strictEqual(reloadedBookingAfterOrder.razorpay_order_id, bookingOrder.id);
    recordTest('Authoritative Order Creation Linked to Booking', true, `Attached order: ${bookingOrder.id}`);

    // ── Test 6: confirmBookingPayment (Success Flow) ─────────────────────────
    console.log('\n[Phase 6] Confirm Service Booking Payment');
    const paymentId = `pay_dev_${Date.now()}`;
    const confirmedBooking = await serviceBookingService.confirmBookingPayment(
      testBooking.id,
      {
        razorpay_order_id: bookingOrder.id,
        razorpay_payment_id: paymentId,
        razorpay_signature: 'sig_test_valid',
        payment_mode: 'razorpay',
      },
      { id: 101, userId: 101 }
    );

    assert.strictEqual(confirmedBooking.payment_status, 'paid');
    assert.strictEqual(confirmedBooking.payment_mode, 'razorpay');
    assert.strictEqual(confirmedBooking.razorpay_payment_id, paymentId);
    assert(confirmedBooking.paid_at, 'paid_at must be populated');

    // Check timeline entry
    const timelines = await ServiceBookingTimeline.findAll({ where: { booking_id: testBooking.id } });
    const paidTimeline = timelines.find((t) => t.status === 'paid');
    assert(paidTimeline, 'Timeline must contain a "paid" entry');
    assert(paidTimeline.notes.includes(paymentId), 'Timeline must mention payment ID');
    recordTest('Confirm Booking Payment & Audit Timeline', true, `Paid at: ${confirmedBooking.paid_at}`);

    // ── Test 7: Idempotent Payment Confirmation ──────────────────────────────
    console.log('\n[Phase 7] Idempotency Protection');
    const reconfirmed = await serviceBookingService.confirmBookingPayment(
      testBooking.id,
      {
        razorpay_order_id: bookingOrder.id,
        razorpay_payment_id: paymentId,
        payment_mode: 'razorpay',
      }
    );
    assert.strictEqual(reconfirmed.payment_status, 'paid');
    const timelinesAfterSecondCall = await ServiceBookingTimeline.findAll({
      where: { booking_id: testBooking.id, status: 'paid' },
    });
    assert.strictEqual(timelinesAfterSecondCall.length, 1, 'Idempotent calls must NOT create duplicate timeline entries');
    recordTest('Payment Confirmation Idempotency Check', true, 'Zero duplicate timeline records');

    // ── Test 8: Webhook Event Processing ─────────────────────────────────────
    console.log('\n[Phase 8] Async Webhook Event Processing');
    // Test payment.captured webhook on fresh booking
    const webhookBooking = await ServiceBooking.create({
      booking_reference: `SG-SRV-WB-${Date.now().toString().slice(-4)}`,
      status: 'confirmed',
      amount: 899.00,
      payment_mode: 'cod',
      payment_status: 'pending',
      razorpay_order_id: `order_dev_webhook_${Date.now()}`,
      service_address: 'Test Address for Webhook',
      time_slot: '02:00 PM - 04:00 PM',
      scheduled_at: new Date(),
    });

    const mockWebhookEvent = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_dev_wb_${Date.now()}`,
            order_id: webhookBooking.razorpay_order_id,
            amount: 89900,
            currency: 'INR',
            status: 'captured',
            notes: {
              booking_id: String(webhookBooking.id),
              booking_reference: webhookBooking.booking_reference,
            },
          },
        },
      },
    };

    const webhookResult = await serviceBookingService.handleRazorpayWebhookEvent(mockWebhookEvent);
    assert.strictEqual(webhookResult.handled, true);
    assert.strictEqual(webhookResult.payment_status, 'paid');

    const verifiedWbBooking = await ServiceBooking.findByPk(webhookBooking.id);
    assert.strictEqual(verifiedWbBooking.payment_status, 'paid');
    recordTest('Asynchronous Webhook payment.captured Handling', true, `Booking #${webhookBooking.id} paid via webhook`);

    // ── Test 9: Refund Processing ───────────────────────────────────────────
    console.log('\n[Phase 9] Enterprise Refund API Processing');
    const refundedBooking = await serviceBookingService.refundBookingPayment(
      testBooking.id,
      {
        amount: 650.00,
        reason: 'Customer cancelled prior to technician dispatch',
      },
      { id: 1, userId: 1 }
    );

    assert.strictEqual(refundedBooking.payment_status, 'refunded');
    assert(refundedBooking.refund_id, 'Refund ID must be generated');
    assert.strictEqual(Number(refundedBooking.refund_amount), 650.00);

    const refundTimelines = await ServiceBookingTimeline.findAll({
      where: { booking_id: testBooking.id, status: 'refunded' },
    });
    assert(refundTimelines.length > 0, 'Refund timeline must be recorded');
    recordTest('Automated Refund Engine & DB Ledger Update', true, `Refund ID: ${refundedBooking.refund_id}`);

    // Cleanup test bookings
    await ServiceBookingTimeline.destroy({ where: { booking_id: [testBooking.id, webhookBooking.id] } });
    await ServiceBooking.destroy({ where: { id: [testBooking.id, webhookBooking.id] } });

    console.log('\n===============================================================');
    console.log('🎉 ALL SERVICE BOOKING RAZORPAY ENTERPRISE TESTS PASSED (9/9)');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    if (testBooking?.id) {
      try {
        await ServiceBookingTimeline.destroy({ where: { booking_id: testBooking.id } });
        await ServiceBooking.destroy({ where: { id: testBooking.id } });
      } catch (_) {}
    }
    process.exit(1);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
