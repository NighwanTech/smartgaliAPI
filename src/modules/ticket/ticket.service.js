import Ticket from './ticket.model.js';

// Generate a random ticket number
const generateTicketNumber = () => {
  return 'TKT-' + Math.floor(100000 + Math.random() * 900000);
};

export const createTicket = async (data) => {
  let ticketNumber = generateTicketNumber();
  let isUnique = false;
  
  // Ensure ticket number uniqueness
  while (!isUnique) {
    const exists = await Ticket.findOne({ where: { ticketNumber } });
    if (!exists) {
      isUnique = true;
    } else {
      ticketNumber = generateTicketNumber();
    }
  }

  const payload = { ...data, ticketNumber };
  return await Ticket.create(payload);
};

export const getAllTickets = async () => {
  return await Ticket.findAll({
    order: [['createdAt', 'DESC']]
  });
};

export const getTicketById = async (id) => {
  return await Ticket.findByPk(id);
};

export const updateTicket = async (id, data) => {
  const ticket = await Ticket.findByPk(id);
  if (!ticket) return null;

  return await ticket.update(data);
};

export const deleteTicket = async (id) => {
  const ticket = await Ticket.findByPk(id);
  if (!ticket) return null;

  await ticket.destroy();
  return true;
};
