// server.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './config/mongodb.js';
import connectCloudinary from './config/cloudinary.js';
import adminRouter from './routes/adminRoute.js';
import doctorRouter from './routes/doctorRoute.js';
import userRouter from './routes/userRoute.js';
import appointmentModel from './models/appointmentModel.js'; // Import your appointment model
import paypal from '@paypal/checkout-server-sdk';

// App config
const app = express();
const port = process.env.PORT || 4000;
connectDB();
connectCloudinary();

// Middlewares
app.use(express.json());
app.use(cors());

// API endpoints
app.use('/api/admin', adminRouter);
app.use('/api/doctor', doctorRouter);
app.use('/api/user', userRouter);

// Root endpoint
app.get('/', (req, res) => {
    res.send('API WORKING');
});

// --- PAYPAL CONFIG --- //
let environment = new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
);
let client = new paypal.core.PayPalHttpClient(environment);

// PayPal Capture Payment Endpoint
app.post('/capture-payment', async (req, res) => { // Removed /api prefix for direct call
    const { token, appointmentId } = req.body;
    const request = new paypal.orders.OrdersCaptureRequest(token);
    request.requestBody({});

    try {
        const capture = await client.execute(request);
        console.log('Capture result:', JSON.stringify(capture.result, null, 2));

        if (capture.result.status === 'COMPLETED') {
            // Update appointment status as paid in your DB
            const updatedAppointment = await appointmentModel.findByIdAndUpdate(
                appointmentId,
                { paid: true, paymentDetails: capture.result },
                { new: true } // To get the updated document
            );

            if (updatedAppointment) {
                res.status(200).json({ success: true, message: 'Payment successful', details: capture.result });
            } else {
                res.status(500).json({ success: false, message: 'Failed to update appointment status' });
            }
        } else {
            res.status(400).json({ success: false, message: 'Payment not completed' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error capturing payment' });
    }
});

// Start server
app.listen(port, () => console.log(`Server started on port ${port}`));   