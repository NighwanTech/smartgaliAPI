import * as ticketService from './ticket.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.createTicket(req.body);
    return successResponse(res, 201, 'Ticket created successfully', ticket);
  } catch (error) {
    next(error);
  }
};

export const getAllTickets = async (req, res, next) => {
  try {
    const tickets = await ticketService.getAllTickets();
    return successResponse(res, 200, 'Tickets fetched successfully', tickets);
  } catch (error) {
    next(error);
  }
};

export const getTicketById = async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketById(req.params.id);
    if (!ticket) return errorResponse(res, 404, 'Ticket not found');
    
    return successResponse(res, 200, 'Ticket fetched successfully', ticket);
  } catch (error) {
    next(error);
  }
};

export const updateTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.updateTicket(req.params.id, req.body);
    if (!ticket) return errorResponse(res, 404, 'Ticket not found');
    
    return successResponse(res, 200, 'Ticket updated successfully', ticket);
  } catch (error) {
    next(error);
  }
};

export const deleteTicket = async (req, res, next) => {
  try {
    const success = await ticketService.deleteTicket(req.params.id);
    if (!success) return errorResponse(res, 404, 'Ticket not found');
    
    return successResponse(res, 200, 'Ticket deleted successfully');
  } catch (error) {
    next(error);
  }
};
