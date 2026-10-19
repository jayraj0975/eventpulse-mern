import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaCheckCircle } from 'react-icons/fa';

const PaymentSuccess = () => {
    const { state } = useLocation();
    const isDemoFlow = Boolean(state?.demoFlow || state?.demoPayment);
    const isSimulatedPaidCheckout = Boolean(state?.demoPayment);

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
            <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full text-center border-t-8 border-green-500 transform transition-all hover:-translate-y-1">
                <FaCheckCircle className="text-green-500 text-7xl mx-auto mb-6 drop-shadow-sm" />
                <h1 className="text-4xl font-black text-gray-900 mb-4">Booking Confirmed!</h1>
                <p className="text-gray-500 mb-4 text-lg">{state?.message || 'Your ticket has been booked successfully. Check your dashboard for ticket details.'}</p>
                {isDemoFlow && (
                    <p className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                        {isSimulatedPaidCheckout
                            ? 'DEMO CHECKOUT — no real money was charged. This is a simulated college demonstration, not a real payment.'
                            : 'DEMO REGISTRATION — this ticket was created for demonstration only. No payment was processed.'}
                    </p>
                )}
                {!isDemoFlow && <div className="mb-8" />}
                <div className="space-y-4">
                    <Link to="/dashboard" className="block w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition shadow-lg hover:shadow-xl">
                        View My Tickets
                    </Link>
                    <Link to="/" className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-4 px-6 rounded-xl transition">
                        Discover More Events
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;
