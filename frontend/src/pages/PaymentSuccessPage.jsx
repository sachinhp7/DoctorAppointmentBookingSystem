import React, { useEffect, useState, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AppContext } from '../context/AppContext'; // Import AppContext

const PaymentSuccessPage = () => {
    const [searchParams] = useSearchParams();
    const [paymentStatus, setPaymentStatus] = useState('Processing payment...');
    const navigate = useNavigate();
    const appointmentId = searchParams.get('appointmentId');
    const paypalToken = searchParams.get('token');
    const { token } = useContext(AppContext); // Access the token from context

    useEffect(() => {
        const capturePayment = async () => {
            if (!token) {
                setPaymentStatus('Not authorized. Please log in again.');
                return;
            }
            try {
                const response = await axios.post(
                    'http://localhost:4000/api/user/payment-paypal/capture',
                    { token: paypalToken, appointmentId },
                    {
                        headers: {
                            'token': token // Include the token in the headers
                        }
                    }
                );
                console.log('Payment Captured:', response.data);
                if (response.data.success) {
                    setPaymentStatus('Payment successful! 🎉');
                    setTimeout(() => {
                        navigate('/my-appointments');
                    }, 2000);
                } else {
                    setPaymentStatus(`Payment failed: ${response.data.message}`);
                }
            } catch (error) {
                console.error('Error capturing payment:', error);
                setPaymentStatus('Payment failed due to an error.');
            }
        };

        if (paypalToken && appointmentId && token) {
            capturePayment();
        } else if (!token) {
            setPaymentStatus('Not authorized. Please log in again.');
        } else {
            setPaymentStatus('Invalid payment data received.');
        }
    }, [paypalToken, appointmentId, navigate, token]); // Include token in dependency array

    return (
        <div style={{ textAlign: 'center', marginTop: '100px' }}>
            <h2>{paymentStatus}</h2>
            {paymentStatus.startsWith('Payment successful') && (
                <p>You will be redirected to your appointments shortly.</p>
            )}
            {paymentStatus.startsWith('Payment failed') && (
                <p>Please check your payment details or try again later.</p>
            )}
            {paymentStatus === 'Not authorized. Please log in again.' && (
                <p>You need to be logged in to complete this action.</p>
            )}
            {paymentStatus === 'Invalid payment data received.' && (
                <p>Something went wrong with the payment information.</p>
            )}
        </div> 
    );
};

export default PaymentSuccessPage;