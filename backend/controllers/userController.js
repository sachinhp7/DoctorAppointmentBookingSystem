import validator from 'validator';
import bcrypt from 'bcrypt';
import userModel from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import isEmail from 'validator/lib/isEmail.js';
import { v2 as cloudinary } from 'cloudinary';
import doctorModel from '../models/doctorModel.js';
import appointmentModel from '../models/appointmentModel.js';
import razorpay from 'razorpay';
import paypal from '@paypal/checkout-server-sdk';
import paypalClient from '../config/paypal.js';

// API to register user
const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !password || !email) {
            return res.json({ success: false, message: "Missing Details" });
        }

        // validaing email format
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Enter a valid email" });
        }

        //validating strong password
        if (password.length < 8) {
            return res.json({ success: false, message: "Enter a strong password" });
        }

        //hashing user password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userData = {
            name,
            email,
            password: hashedPassword
        };

        const newUser = new userModel(userData);
        const user = await newUser.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.json({ success: true, token });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

//api for user login
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: 'User does not exixst' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
            res.json({ success: true, token });
        } else {
            res.json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// api to get user profile data
const getProfile = async (req, res) => {
    try {
        const { userId } = req.body;
        const userData = await userModel.findById(userId).select('-password');

        res.json({ success: true, userData });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

//api to update user profile
const updateProfile = async (req, res) => {
    try {
        const { userId, name, phone, address, dob, gender } = req.body;
        const imageFile = req.file; // Access the uploaded file using req.file

        if (!name || !phone || !dob || !gender) {
            return res.json({ success: false, message: "Data Missing" });
        }

        await userModel.findByIdAndUpdate(userId, { name, phone, address: JSON.parse(address), dob, gender });

        if (imageFile) {
            try {
                //upload image to cloudinary
                const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: 'image' });
                const imageURL = imageUpload.secure_url;

                await userModel.findByIdAndUpdate(userId, { image: imageURL });
            } catch (cloudinaryError) {
                console.error("Cloudinary Upload Error:", cloudinaryError);
                return res.status(500).json({ success: false, message: "Failed to upload image to Cloudinary" });
            }
        }

        res.json({ success: true, message: "profile updated" });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

//api to book appointment
const bookAppointment = async (req, res) => {
    try {
        const { userId, docId, slotDate, slotTime } = req.body;

        const docData = await doctorModel.findById(docId).select('-password');

        if (!docData.available) {
            return res.json({ success: false, message: "Doctor not avialable" });
        }

        let slots_booked = docData.slots_booked;

        //checking for slot availability
        if (slots_booked[slotDate]) {
            if (slots_booked[slotDate].includes(slotTime)) {
                return res.json({ success: false, message: 'Slot not available' });
            } else {
                slots_booked[slotDate].push(slotTime);
            }
        } else {
            slots_booked[slotDate] = [];
            slots_booked[slotDate].push(slotTime);
        }

        const userData = await userModel.findById(userId).select('-password');

        delete docData.slots_booked;

        const appointmentData = {
            userId,
            docId,
            userData,
            docData,
            amount: docData.fees,
            slotTime,
            slotDate,
            date: Date.now()
        };

        const newAppointment = new appointmentModel(appointmentData);
        await newAppointment.save();

        //save new slots data in docDATA
        await doctorModel.findByIdAndUpdate(docId, { slots_booked });

        res.json({ success: true, message: 'Appointment Booked' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// api to get user appointments for front-end my-appointments page
const listAppointment = async (req, res) => {
    try {
        const { userId } = req.body;
        const appointments = await appointmentModel.find({ userId });

        res.json({ success: true, appointments });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

//api to cancel appointment
const cancelAppointment = async (req, res) => {
    try {
        const { userId, appointmentId } = req.body;
        const appointmentData = await appointmentModel.findById(appointmentId);

        //verify apointment user
        if (appointmentData.userId !== userId) {
            return res.json({ success: false, message: 'Unautheerzied Action' });
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });

        //releasing doctors slot
        const { docId, slotDate, slotTime } = appointmentData;
        const doctorData = await doctorModel.findById(docId);
        let slots_booked = doctorData.slots_booked;
        slots_booked[slotDate] = slots_booked[slotDate].filter(e => e !== slotTime);
        await doctorModel.findByIdAndUpdate(docId, { slots_booked });

        res.json({ success: true, message: "Appointment cancelled" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to make payment of appointment using PayPal
const paymentPaypal = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        const appointmentData = await appointmentModel.findById(appointmentId);

        if (!appointmentData || appointmentData.cancelled) {
            return res.json({ success: false, message: "Appointment cancelled or not found" });
        }

        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer('return=representation');
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: process.env.CURRENCY,
                    value: appointmentData.amount.toString()
                },
                description: `Payment for appointment with ${appointmentData.docData.name}`
            }],
            application_context: {
                return_url: `${process.env.FRONTEND_URL}/payment-success?appointmentId=${appointmentId}`,
                cancel_url: `${process.env.FRONTEND_URL}/payment-cancel?appointmentId=${appointmentId}`
            }
        });

        const order = await paypalClient().execute(request);

        const approvalLink = order.result.links.find(link => link.rel === 'approve').href;

        res.json({ success: true, approvalLink });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to capture the PayPal payment after user approval
const capturePaypalPayment = async (req, res) => {
    console.log("ENTERING capturePaypalPayment FUNCTION");
    console.log("Request Body:", req.body);
    try {
        const { token, appointmentId } = req.body;
        console.log("Received appointmentId:", appointmentId);

        let captureResult;
        try {
            const request = new paypal.orders.OrdersCaptureRequest(token);
            console.log("Creating PayPal Capture Request"); // ADD THIS
            captureResult = await paypalClient().execute(request);
            console.log("PayPal Execute Completed"); // ADD THIS
        } catch (paypalError) {
            console.error("Error during PayPal execute:", paypalError);
            return res.json({ success: false, message: "Error communicating with PayPal" });
        }

        const capture = captureResult;
        console.log("Capture Result Assigned"); // ADD THIS
        console.log("Capture Status Code:", capture.statusCode);

        if (capture.statusCode === 201) {
            console.log("PayPal Capture Successful for appointmentId:", appointmentId);
            console.log("Attempting to update appointment:", appointmentId);
            await appointmentModel.findByIdAndUpdate(appointmentId, { payment: true, paymentDetails: capture.result });
            console.log("Database update completed for appointment:", appointmentId);
            return res.json({ success: true, message: "Payment successful" });
        } else {
            console.error("PayPal Capture Error:", capture);
            return res.json({ success: false, message: "Failed to capture payment" });
        }
    } catch (error) {
        console.error("Error capturing PayPal payment (outer catch):", error);
        res.json({ success: false, message: error.message });
    }
};

export { registerUser, loginUser, getProfile, updateProfile, bookAppointment, listAppointment, cancelAppointment, paymentPaypal, capturePaypalPayment };