import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/axios';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [analyticsKpis, setAnalyticsKpis] = useState(null);
    const [statusSummary, setStatusSummary] = useState([]);
    const [popularityRanking, setPopularityRanking] = useState([]);
    const [showAnalyticsSection, setShowAnalyticsSection] = useState(true);
    const [loading, setLoading] = useState(true);

    const [showEventForm, setShowEventForm] = useState(false);
    const [formData, setFormData] = useState({
        title: '', description: '', date: '', location: '', category: '', totalSeats: '', ticketPrice: '', image: ''
    });

    useEffect(() => {
        if (!user || user.role !== 'admin') {
            navigate('/login');
            return;
        }
        fetchData();
    }, [user, navigate]);

    const fetchData = async () => {
        try {
            const [eventsRes, bookingsRes, kpiRes, statusRes, popularityRes] = await Promise.all([
                api.get('/events'),
                api.get('/bookings/my'), // Admin gets all bookings
                api.get('/analytics/overview'),
                api.get('/analytics/booking-status'),
                api.get('/analytics/event-popularity')
            ]);
            setEvents(eventsRes.data);
            setBookings(bookingsRes.data);
            setAnalyticsKpis(kpiRes.data.kpis);
            setStatusSummary(statusRes.data.data);
            setPopularityRanking(popularityRes.data.data);
        } catch (error) {
            console.error('Error fetching admin data', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        try {
            await api.post('/events', formData);
            setShowEventForm(false);
            setFormData({ title: '', description: '', date: '', location: '', category: '', totalSeats: '', ticketPrice: '', image: '' });
            fetchData();
        } catch (error) {
            alert(error.response?.data?.message || 'Error creating event');
        }
    };

    const handleDeleteEvent = async (id) => {
        if (window.confirm('Are you sure you want to delete this event?')) {
            try {
                await api.delete(`/events/${id}`);
                fetchData();
            } catch (error) {
                alert('Error deleting event');
            }
        }
    };

    const handleConfirmBooking = async (id, paymentStatus) => {
        try {
            await api.put(`/bookings/${id}/confirm`, { paymentStatus });
            fetchData();
        } catch (error) {
            alert(error.response?.data?.message || 'Error confirming booking');
        }
    };

    const handleCancelBooking = async (id) => {
        if (window.confirm('Cancel this user\'s booking request?')) {
            try {
                await api.delete(`/bookings/${id}`);
                fetchData();
            } catch (error) {
                alert(error.response?.data?.message || 'Error cancelling booking');
            }
        }
    };

    if (loading) return <div className="text-center py-20 text-xl font-semibold">Loading admin panel...</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <div className="bg-black text-white rounded-2xl p-6 sm:p-8 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
                <div>
                    <div className="inline-block bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 border border-green-500/30">
                        ⚡ MongoDB Aggregations Active
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">Admin Dashboard</h1>
                    <p className="text-gray-300">Manage events, verify booking requests, and inspect real database analytics.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setShowAnalyticsSection(!showAnalyticsSection)}
                        className="bg-gray-800 text-white font-bold py-3 px-5 rounded-lg hover:bg-gray-700 transition border border-gray-700 shadow-md text-sm"
                    >
                        {showAnalyticsSection ? 'Hide AD Reports' : 'View AD Reports'}
                    </button>
                    <button
                        onClick={() => setShowEventForm(!showEventForm)}
                        className="bg-white text-black font-bold py-3 px-6 rounded-lg hover:bg-gray-100 transition shadow-md text-sm"
                    >
                        {showEventForm ? 'Cancel Creation' : '+ Create New Event'}
                    </button>
                </div>
            </div>

            {/* Admin Stats Row (Sourced directly from MongoDB $facet Aggregation) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Verified Revenue</p>
                        <h3 className="text-3xl font-black text-green-600">₹{analyticsKpis?.totalRevenue ?? 0}</h3>
                        <p className="text-[11px] text-gray-400 mt-1">Confirmed & Paid only</p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold">₹</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Paid Clients</p>
                        <h3 className="text-3xl font-black text-blue-600">{analyticsKpis?.paidClients ?? 0}</h3>
                        <p className="text-[11px] text-gray-400 mt-1">Unique customers</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center text-xl font-bold">👤</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Pending Requests</p>
                        <h3 className="text-3xl font-black text-yellow-600">{analyticsKpis?.pendingRequests ?? 0}</h3>
                        <p className="text-[11px] text-gray-400 mt-1">Awaiting approval</p>
                    </div>
                    <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xl font-bold">⏳</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Confirmed Bookings</p>
                        <h3 className="text-3xl font-black text-indigo-600">{analyticsKpis?.confirmedBookings ?? 0}</h3>
                        <p className="text-[11px] text-gray-400 mt-1">Total active tickets</p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xl font-bold">🎟️</div>
                </div>
            </div>

            {/* AD Aggregation Reports Showcase Section */}
            {showAnalyticsSection && (
                <div className="bg-white rounded-2xl p-6 sm:p-8 mb-8 shadow-sm border border-gray-100">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-gray-100">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                📊 MongoDB Aggregation Reports
                                <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-bold">AD Mini-Project</span>
                            </h2>
                            <p className="text-sm text-gray-500">Live analytics computed directly by MongoDB aggregation pipelines ($match, $group, $lookup, $sort).</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Report 1: Booking Status Breakdown */}
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200/70 flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-700 mb-3 flex items-center justify-between">
                                    <span>Pipeline 1: Status Summary</span>
                                    <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-mono">$group</span>
                                </h3>
                                <div className="space-y-3">
                                    {statusSummary.length === 0 ? (
                                        <p className="text-gray-400 text-sm">No bookings recorded.</p>
                                    ) : (
                                        statusSummary.map((item) => (
                                            <div key={item.status} className="bg-white p-3 rounded-lg border border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-wider ${
                                                        item.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                                        item.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                    <p className="text-xs text-gray-500 mt-1">Paid: {item.paidCount} | Unpaid: {item.unpaidCount}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-lg font-black text-gray-900">{item.count}</span>
                                                    <p className="text-[11px] text-gray-400">₹{item.totalAmountRequested}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-4 pt-2 border-t border-gray-200">
                                Stages: <code>$group (_id: '$status')</code> → <code>$project</code> → <code>$sort</code>
                            </p>
                        </div>

                        {/* Report 2 & 3: Popularity & Verified Revenue Ranking */}
                        <div className="lg:col-span-2 bg-gray-50 rounded-xl p-5 border border-gray-200/70 flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-700 mb-3 flex items-center justify-between">
                                    <span>Pipeline 2 & 3: Event Popularity & Revenue Ranking</span>
                                    <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-mono">$match + $lookup + $sort</span>
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs bg-white rounded-lg border border-gray-100 overflow-hidden">
                                        <thead className="bg-gray-100 text-gray-600 uppercase text-[10px] font-bold">
                                            <tr>
                                                <th className="p-3">Event Title</th>
                                                <th className="p-3">Category</th>
                                                <th className="p-3 text-center">Confirmed</th>
                                                <th className="p-3 text-right">Paid Revenue</th>
                                                <th className="p-3 text-right">Available</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {popularityRanking.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="p-4 text-center text-gray-400">No confirmed bookings yet.</td>
                                                </tr>
                                            ) : (
                                                popularityRanking.map((event, idx) => (
                                                    <tr key={event.eventId || idx} className="hover:bg-gray-50">
                                                        <td className="p-3 font-semibold text-gray-900">{event.eventTitle}</td>
                                                        <td className="p-3 text-gray-500">{event.category}</td>
                                                        <td className="p-3 text-center font-bold text-indigo-600">{event.confirmedBookings}</td>
                                                        <td className="p-3 text-right font-black text-green-600">₹{event.paidRevenue}</td>
                                                        <td className="p-3 text-right text-gray-500">{event.availableSeats}/{event.totalSeats}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-4 pt-2 border-t border-gray-200">
                                Stages: <code>$match (confirmed)</code> → <code>$group ($sum)</code> → <code>$lookup (events)</code> → <code>$sort (demand desc)</code>
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showEventForm && (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-8 animation-slideDown">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800">Create New Event</h2>
                    <form onSubmit={handleCreateEvent} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <input required type="text" placeholder="Event Title" className="border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                        <input required type="text" placeholder="Category (e.g., Tech, Music)" className="border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
                        <input required type="date" className="border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                        <input required type="text" placeholder="Location" className="border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                        <input required type="number" placeholder="Total Seats" className="border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.totalSeats} onChange={e => setFormData({ ...formData, totalSeats: e.target.value })} />
                        <input required type="number" placeholder="Ticket Price (0 for free)" className="border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.ticketPrice} onChange={e => setFormData({ ...formData, ticketPrice: e.target.value })} />

                        <div className="md:col-span-2">
                            <input type="text" placeholder="Image URL (Provide any direct link to an image)" className="w-full border px-4 py-3 rounded-lg focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} />
                        </div>

                        <textarea required placeholder="Event Description" className="border px-4 py-3 rounded-lg md:col-span-2 h-32 focus:ring-2 focus:ring-gray-700 outline-none transition" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        <button type="submit" className="md:col-span-2 bg-gray-900 text-white font-bold py-3 mt-2 rounded-lg hover:bg-black transition shadow-md">Publish Event</button>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Events Section */}
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 text-sm">{events.length}</span>
                        All Events
                    </h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                            {events.length === 0 ? <li className="p-6 text-gray-500 text-center">No events created yet.</li> :
                                events.map(event => (
                                    <li key={event._id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                                        <div>
                                            <h4 className="font-bold text-gray-900 mb-1 leading-tight">{event.title}</h4>
                                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                                <span className="flex items-center gap-1 font-medium"><div className="w-2 h-2 rounded-full bg-blue-500"></div> {new Date(event.date).toLocaleDateString()}</span>
                                                <span className="flex items-center gap-1 font-medium"><div className={`w-2 h-2 rounded-full ${event.availableSeats > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div> {event.availableSeats}/{event.totalSeats} seats</span>
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteEvent(event._id)} className="w-full sm:w-auto text-red-500 hover:text-white hover:bg-red-500 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm shrink-0">
                                            Delete
                                        </button>
                                    </li>
                                ))
                            }
                        </ul>
                    </div>
                </div>

                {/* Bookings Section */}
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 text-sm font-bold">{bookings.length}</span>
                        Booking Requests
                    </h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                            {bookings.length === 0 ? <li className="p-6 text-gray-500 text-center">No bookings yet.</li> :
                                bookings.map(booking => (
                                    <li key={booking._id} className={`p-6 hover:bg-gray-50 transition border-l-4 ${booking.status === 'pending' ? 'border-l-yellow-400' : booking.status === 'confirmed' ? 'border-l-green-400' : 'border-l-red-400'}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="font-bold text-gray-900 text-lg leading-tight">{booking.eventId?.title || 'Deleted Event'}</h4>
                                            <div className="flex flex-col gap-1 items-end shrink-0 ml-4">
                                                <span className={`px-2 py-1 text-[10px] font-black rounded uppercase tracking-wider ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700' : booking.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{booking.status}</span>
                                                {booking.status !== 'cancelled' && <span className={`px-2 py-1 text-[10px] font-black rounded uppercase tracking-wider ${booking.paymentStatus === 'paid' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-800'}`}>{booking.paymentStatus.replace('_', ' ')}</span>}
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-100 text-sm">
                                            <p className="text-gray-700 flex items-center gap-2 mb-1">
                                                <span className="font-bold w-16 text-gray-500 uppercase text-xs">User:</span>
                                                <span className="font-semibold">{booking.userId?.name}</span>
                                                <span className="text-gray-400">({booking.userId?.email})</span>
                                            </p>
                                            <p className="text-gray-700 flex items-center gap-2 mb-1">
                                                <span className="font-bold w-16 text-gray-500 uppercase text-xs">Amount:</span>
                                                <span className={`font-semibold ${booking.amount === 0 ? 'text-green-600' : ''}`}>{booking.amount === 0 ? 'Free' : `₹${booking.amount}`}</span>
                                            </p>
                                            <p className="text-gray-700 flex items-center gap-2 mb-1">
                                                <span className="font-bold w-16 text-gray-500 uppercase text-xs">Date:</span>
                                                <span>{new Date(booking.bookedAt).toLocaleString()}</span>
                                            </p>
                                            {booking.eventId && (
                                                <p className="text-gray-700 flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                                                    <span className="font-bold w-16 text-gray-500 uppercase text-xs">Seats:</span>
                                                    <span className={`font-bold ${booking.eventId.availableSeats > 0 ? 'text-green-600' : 'text-red-500'}`}>{booking.eventId.availableSeats}</span> remaining of {booking.eventId.totalSeats}
                                                </p>
                                            )}
                                        </div>

                                        {/* Action buttons for admin */}
                                        {booking.status === 'pending' && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <button onClick={() => handleConfirmBooking(booking._id, 'paid')} className="flex-1 min-w-[120px] bg-green-50 text-green-700 hover:bg-green-600 hover:text-white border border-green-200 text-xs font-bold py-2.5 px-3 rounded-lg shadow-sm transition">
                                                    ✓ Approve as Paid
                                                </button>
                                                <button onClick={() => handleConfirmBooking(booking._id, 'not_paid')} className="flex-1 min-w-[120px] bg-gray-50 text-gray-700 hover:bg-gray-800 hover:text-white border border-gray-200 text-xs font-bold py-2.5 px-3 rounded-lg shadow-sm transition">
                                                    ✓ Approve Undecided
                                                </button>
                                                <button onClick={() => handleCancelBooking(booking._id)} className="w-[80px] bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 text-xs font-bold py-2.5 px-3 rounded-lg transition">
                                                    ✕ Reject
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))
                            }
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
