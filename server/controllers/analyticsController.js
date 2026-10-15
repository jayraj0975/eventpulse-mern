const Booking = require('../models/Booking');
const Event = require('../models/Event');
const mongoose = require('mongoose');

/**
 * Report 1: Booking Status Summary
 * Groups all bookings by status (pending, confirmed, cancelled).
 * Demonstrates: $group, $cond, $project, $sort
 */
exports.getBookingStatusSummary = async (req, res) => {
    try {
        const summary = await Booking.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmountRequested: { $sum: '$amount' },
                    paidCount: {
                        $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
                    },
                    unpaidCount: {
                        $sum: { $cond: [{ $eq: ['$paymentStatus', 'not_paid'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    status: '$_id',
                    count: 1,
                    totalAmountRequested: 1,
                    paidCount: 1,
                    unpaidCount: 1,
                    _id: 0
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            pipeline: 'booking-status-summary',
            data: summary
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Aggregation failed', error: error.message });
    }
};

/**
 * Report 2: Event Booking & Revenue Summary
 * Joins events with bookings, computing confirmed paid revenue,
 * occupancy percentage, and status breakdowns per event.
 * Demonstrates: $lookup, $project with $filter and $reduce, $cond, $sort
 */
exports.getEventSummary = async (req, res) => {
    try {
        const summary = await Event.aggregate([
            {
                $lookup: {
                    from: 'bookings',
                    localField: '_id',
                    foreignField: 'eventId',
                    as: 'bookings'
                }
            },
            {
                $project: {
                    title: 1,
                    category: 1,
                    ticketPrice: 1,
                    totalSeats: 1,
                    availableSeats: 1,
                    date: 1,
                    totalBookings: { $size: '$bookings' },
                    confirmedBookings: {
                        $size: {
                            $filter: {
                                input: '$bookings',
                                as: 'b',
                                cond: { $eq: ['$$b.status', 'confirmed'] }
                            }
                        }
                    },
                    pendingBookings: {
                        $size: {
                            $filter: {
                                input: '$bookings',
                                as: 'b',
                                cond: { $eq: ['$$b.status', 'pending'] }
                            }
                        }
                    },
                    cancelledBookings: {
                        $size: {
                            $filter: {
                                input: '$bookings',
                                as: 'b',
                                cond: { $eq: ['$$b.status', 'cancelled'] }
                            }
                        }
                    },
                    // Verified revenue: ONLY confirmed AND paid bookings
                    verifiedRevenue: {
                        $reduce: {
                            input: '$bookings',
                            initialValue: 0,
                            in: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$$this.status', 'confirmed'] },
                                            { $eq: ['$$this.paymentStatus', 'paid'] }
                                        ]
                                    },
                                    { $add: ['$$value', '$$this.amount'] },
                                    '$$value'
                                ]
                            }
                        }
                    },
                    occupancyRate: {
                        $cond: [
                            { $gt: ['$totalSeats', 0] },
                            {
                                $round: [
                                    {
                                        $multiply: [
                                            { $divide: [{ $subtract: ['$totalSeats', '$availableSeats'] }, '$totalSeats'] },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            0
                        ]
                    }
                }
            },
            { $sort: { verifiedRevenue: -1, confirmedBookings: -1 } }
        ]);

        res.json({
            success: true,
            pipeline: 'event-revenue-summary',
            data: summary
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Aggregation failed', error: error.message });
    }
};

/**
 * Report 3: Event Popularity Ranking
 * Ranks events by confirmed booking demand.
 * Demonstrates: $match, $group, $lookup, $unwind, $project, $sort
 */
exports.getEventPopularity = async (req, res) => {
    try {
        const popularity = await Booking.aggregate([
            {
                // Only confirmed bookings indicate actual ticket demand
                $match: { status: 'confirmed' }
            },
            {
                $group: {
                    _id: '$eventId',
                    confirmedBookings: { $sum: 1 },
                    paidRevenue: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'events',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'event'
                }
            },
            { $unwind: '$event' },
            {
                $project: {
                    eventId: '$_id',
                    eventTitle: '$event.title',
                    category: '$event.category',
                    ticketPrice: '$event.ticketPrice',
                    totalSeats: '$event.totalSeats',
                    availableSeats: '$event.availableSeats',
                    confirmedBookings: 1,
                    paidRevenue: 1,
                    _id: 0
                }
            },
            { $sort: { confirmedBookings: -1, paidRevenue: -1 } }
        ]);

        res.json({
            success: true,
            pipeline: 'event-popularity-ranking',
            data: popularity
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Aggregation failed', error: error.message });
    }
};

/**
 * Overview KPIs: Real Database Summary for Admin Cards
 * Demonstrates: $facet for multi-faceted single-pass aggregation
 */
exports.getOverviewKPIs = async (req, res) => {
    try {
        const [bookingStats, eventCount] = await Promise.all([
            Booking.aggregate([
                {
                    $facet: {
                        revenueStats: [
                            { $match: { status: 'confirmed', paymentStatus: 'paid' } },
                            {
                                $group: {
                                    _id: null,
                                    totalRevenue: { $sum: '$amount' },
                                    paidBookingsCount: { $sum: 1 },
                                    uniquePaidUsers: { $addToSet: '$userId' }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    totalRevenue: 1,
                                    paidBookingsCount: 1,
                                    paidClientsCount: { $size: '$uniquePaidUsers' }
                                }
                            }
                        ],
                        statusCounts: [
                            {
                                $group: {
                                    _id: '$status',
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        totalCount: [
                            { $count: 'total' }
                        ]
                    }
                }
            ]),
            Event.countDocuments()
        ]);

        const facet = bookingStats[0];
        const rev = facet.revenueStats[0] || { totalRevenue: 0, paidBookingsCount: 0, paidClientsCount: 0 };
        const statusMap = {};
        facet.statusCounts.forEach(s => { statusMap[s._id] = s.count; });
        const totalBookings = facet.totalCount[0] ? facet.totalCount[0].total : 0;

        res.json({
            success: true,
            kpis: {
                totalRevenue: rev.totalRevenue,
                paidClients: rev.paidClientsCount,
                pendingRequests: statusMap.pending || 0,
                confirmedBookings: statusMap.confirmed || 0,
                cancelledBookings: statusMap.cancelled || 0,
                totalBookings: totalBookings,
                totalEvents: eventCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'KPI calculation failed', error: error.message });
    }
};
