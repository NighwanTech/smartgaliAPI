const fs = require('fs');

// 1. Update create_service_screen.dart
const createPath = 'c:/flutter/my_first_app/lib/modules/provider/create_service_screen.dart';
let createContent = fs.readFileSync(createPath, 'utf8');

// Insert dynamic execution methods in _initMasters
const capBlock = `      if (_selectedBookingCapacityId == null || !_capacityOptions.any((o) => o['id'] == _selectedBookingCapacityId)) {
        _selectedBookingCapacityId = _capacityOptions.first['id'] as int;
        _bookingCapacityCount = _capacityOptions.first['capacity'] as int;
        _bookingCapacityLabel = _capacityOptions.first['label'] as String;
      }`;

const dynamicExecBlock = `      if (_selectedBookingCapacityId == null || !_capacityOptions.any((o) => o['id'] == _selectedBookingCapacityId)) {
        _selectedBookingCapacityId = _capacityOptions.first['id'] as int;
        _bookingCapacityCount = _capacityOptions.first['capacity'] as int;
        _bookingCapacityLabel = _capacityOptions.first['label'] as String;
      }

      // Load Execution Methods Master dynamically from Database
      try {
        final execData = await marketplace.fetchServiceMaster('execution-methods');
        if (execData.isNotEmpty) {
          _executionMethodOptions = execData.where((e) => e['is_active'] != false).map((e) {
            return {
              'id': (e['id'] as num).toInt(),
              'code': (e['code'] ?? '').toString(),
              'name': (e['name'] ?? '').toString(),
              'description': (e['description'] ?? '').toString(),
            };
          }).toList();
        }
      } catch (e) {
        debugPrint('Failed to load execution methods from backend: $e');
      }

      if (_executionMethodOptions.isEmpty) {
        _executionMethodOptions = [
          {'id': 1, 'code': 'CUSTOMER_LOCATION', 'name': 'At Customer Location / Home Visit', 'description': 'Professional visits residence or office'},
          {'id': 2, 'code': 'PROVIDER_WORKSHOP', 'name': 'At Provider Workshop / Service Center', 'description': 'Customer brings item to designated workshop'},
          {'id': 3, 'code': 'PICKUP_DELIVERY', 'name': 'Pickup & Delivery', 'description': 'Doorstep pickup, workshop repair and doorstep return'},
          {'id': 4, 'code': 'REMOTE', 'name': 'Remote / Online Assistance', 'description': 'Over phone, video or screen-sharing consultation'},
        ];
      }
      if (_selectedExecutionMethodId == null || !_executionMethodOptions.any((o) => o['id'] == _selectedExecutionMethodId)) {
        _selectedExecutionMethodId = _executionMethodOptions.first['id'] as int;
        _executionMethodName = _executionMethodOptions.first['name'] as String;
      }`;

createContent = createContent.replace(capBlock.replace(/\n/g, '\r\n'), dynamicExecBlock.replace(/\n/g, '\r\n'));

// Replace hardcoded DropdownButton in Step 3
const oldDropdown = `        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFCBD5E1)),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: _executionMethod,
              icon: const Icon(Icons.keyboard_arrow_down, color: Color(0xFF64748B)),
              items: ['At Customer Location', 'At Provider Workshop', 'Remote / Online'].map((m) {
                return DropdownMenuItem(value: m, child: Text(m, style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A))));
              }).toList(),
              onChanged: (val) {
                if (val != null) setState(() => _executionMethod = val);
              },
            ),
          ),
        ),`;

const newDropdown = `        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFCBD5E1)),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              isExpanded: true,
              value: _selectedExecutionMethodId,
              icon: const Icon(Icons.keyboard_arrow_down, color: Color(0xFF64748B)),
              items: _executionMethodOptions.map((m) {
                return DropdownMenuItem<int>(
                  value: m['id'] as int,
                  child: Text(
                    m['name'] as String,
                    style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A)),
                    overflow: TextOverflow.ellipsis,
                  ),
                );
              }).toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() {
                    _selectedExecutionMethodId = val;
                    final match = _executionMethodOptions.firstWhere((o) => o['id'] == val, orElse: () => _executionMethodOptions.first);
                    _executionMethodName = match['name'] as String;
                  });
                }
              },
            ),
          ),
        ),`;

createContent = createContent.replace(oldDropdown.replace(/\n/g, '\r\n'), newDropdown.replace(/\n/g, '\r\n'));

// Pass executionMethodId in _repo.createService
const oldCreateCall = `        slotDurationId: _selectedSlotDurationId,
        bookingCapacityId: _selectedBookingCapacityId,
      );`;

const newCreateCall = `        slotDurationId: _selectedSlotDurationId,
        bookingCapacityId: _selectedBookingCapacityId,
        executionMethodId: _selectedExecutionMethodId,
      );`;

createContent = createContent.replace(oldCreateCall.replace(/\n/g, '\r\n'), newCreateCall.replace(/\n/g, '\r\n'));

fs.writeFileSync(createPath, createContent, 'utf8');
console.log('Updated create_service_screen.dart');


// 2. Update edit_service_screen.dart
const editPath = 'c:/flutter/my_first_app/lib/modules/provider/edit_service_screen.dart';
let editContent = fs.readFileSync(editPath, 'utf8');

// Add executionMethodId to updateService in _saveChanges
const oldEditSave = `      await _repo.updateService(
        updated,
        slotDurationId: _selectedSlotDurationId ?? 3,
        bookingCapacityId: _selectedBookingCapacityId ?? 1,
      );`;

const newEditSave = `      await _repo.updateService(
        updated,
        slotDurationId: _selectedSlotDurationId ?? 3,
        bookingCapacityId: _selectedBookingCapacityId ?? 1,
        executionMethodId: widget.service.executionMethodId,
      );`;

editContent = editContent.replace(oldEditSave.replace(/\n/g, '\r\n'), newEditSave.replace(/\n/g, '\r\n'));
fs.writeFileSync(editPath, editContent, 'utf8');
console.log('Updated edit_service_screen.dart');


// 3. Update provider_booking_detail_screen.dart to refresh booking on accept
const detailPath = 'c:/flutter/my_first_app/lib/modules/services/screens/provider_booking_detail_screen.dart';
let detailContent = fs.readFileSync(detailPath, 'utf8');

const oldHandleAccept = `  Future<void> _handleAcceptBooking() async {
    setState(() => _isActionInProgress = true);
    try {
      await _service.updateBookingStatus(_booking.id, 'confirmed');
      SocketService().emitBookingStatusChange(_booking.id, 'confirmed');
      ProviderMockRepository().updateBookingStatusLocally(_booking.id, 'confirmed');
      if (!mounted) return;
      setState(() {
        _booking = _booking.copyWith(status: 'confirmed');
        _isActionInProgress = false;
      });
      _showToast('Booking #\${_booking.id} confirmed! Ready to start journey.');
    } catch (e) {
      if (!mounted) return;
      setState(() => _isActionInProgress = false);
      _showToast('Failed to accept: $e');
    }
  }`;

const newHandleAccept = `  Future<void> _handleAcceptBooking() async {
    setState(() => _isActionInProgress = true);
    try {
      await _service.updateBookingStatus(_booking.id, 'confirmed');
      SocketService().emitBookingStatusChange(_booking.id, 'confirmed');
      ProviderMockRepository().updateBookingStatusLocally(_booking.id, 'confirmed');
      // Freshly fetch booking from server to reveal unmasked customer phone and address
      final fresh = await _service.getBookingById(_booking.id);
      if (!mounted) return;
      setState(() {
        _booking = fresh ?? _booking.copyWith(status: 'confirmed');
        _isActionInProgress = false;
      });
      _showToast('Booking #\${_booking.id} confirmed! Ready to start journey.');
    } catch (e) {
      if (!mounted) return;
      setState(() => _isActionInProgress = false);
      _showToast('Failed to accept: $e');
    }
  }`;

detailContent = detailContent.replace(oldHandleAccept.replace(/\n/g, '\r\n'), newHandleAccept.replace(/\n/g, '\r\n'));
fs.writeFileSync(detailPath, detailContent, 'utf8');
console.log('Updated provider_booking_detail_screen.dart');

