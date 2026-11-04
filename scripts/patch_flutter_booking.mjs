import fs from 'fs';
import path from 'path';

const filePath = 'C:/flutter/my_first_app/lib/modules/services/screens/book_service_screen.dart';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Replace _loadSavedAddresses
const oldLoadRegex = /Future<void> _loadSavedAddresses\(\) async \{[\s\S]*?\}\s*\}\s*catch \(_\) \{\}\s*\}/;
const newLoadCode = `Future<void> _loadSavedAddresses() async {
    try {
      final res = await _userAddressService.getAddresses();
      if (!mounted) return;
      if (res.isSuccess && (res.data?.isNotEmpty ?? false)) {
        final defaultAddr = res.data!.firstWhere(
          (a) => a.isDefault,
          orElse: () => res.data!.first,
        );
        _applySavedAddress(defaultAddr);
      }
    } catch (_) {}
  }

  void _applySavedAddress(UserAddressModel addr) {
    setState(() {
      _selectedSavedAddress = addr;
      if (addr.flatUnit != null && addr.flatUnit!.isNotEmpty) {
        _houseNoController.text = addr.flatUnit!;
        _flatController.text = addr.flatUnit!;
      }
      if (addr.buildingName != null && addr.buildingName!.isNotEmpty) {
        _landmarkController.text = addr.buildingName!;
        _towerController.text = addr.buildingName!;
      }
      if (addr.streetAddress != null && addr.streetAddress!.isNotEmpty) {
        _streetRoadController.text = addr.streetAddress!;
      }
      if (addr.locality != null && addr.locality!.isNotEmpty) {
        _custLocality = addr.locality!;
        _localityController.text = addr.locality!;
      }
      if (addr.city != null && addr.city!.isNotEmpty) {
        _custCity = addr.city!;
        _cityController.text = addr.city!;
      }
      if (addr.pincode != null && addr.pincode!.isNotEmpty) {
        _custPincode = addr.pincode!;
        _pincodeController.text = addr.pincode!;
      }
      if (addr.latitude != null) {
        _custLat = addr.latitude!;
      }
      if (addr.longitude != null) {
        _custLon = addr.longitude!;
      }
      if (addr.societyName != null && addr.societyName!.isNotEmpty) {
        _societyController.text = addr.societyName!;
        _locationType = 'society';
      } else {
        _locationType = 'public';
      }
    });
    _checkCoveragePerimeter();
  }`;

if (oldLoadRegex.test(code)) {
  code = code.replace(oldLoadRegex, newLoadCode);
  console.log('Successfully replaced _loadSavedAddresses');
} else {
  console.error('Could not match old _loadSavedAddresses pattern');
}

// 2. Add addressId to createBooking
if (!code.includes('addressId: _selectedSavedAddress?.id,')) {
  code = code.replace(
    'scheduledAt: _selectedDate,',
    'scheduledAt: _selectedDate,\n        addressId: _selectedSavedAddress?.id,'
  );
  console.log('Successfully added addressId to createBooking');
}

// 3. Add Saved Address Card in _buildStep3ServiceLocation
const savedAddressCard = `        // Saved Address Selection Card (Priority 2)
        Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFCBD5E1)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.bookmark_rounded, size: 16, color: Color(0xFF2563EB)),
                      const SizedBox(width: 6),
                      const Text(
                        'Saved Service Address',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                      ),
                      if (_selectedSavedAddress != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEFF6FF),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            _selectedSavedAddress!.typeLabel.toUpperCase(),
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF2563EB)),
                          ),
                        ),
                      ],
                    ],
                  ),
                  TextButton.icon(
                    onPressed: () async {
                      final picked = await AddressSelectionBottomSheet.show(
                        context,
                        currentSelectedId: _selectedSavedAddress?.id,
                      );
                      if (picked != null && mounted) {
                        _applySavedAddress(picked);
                      }
                    },
                    icon: const Icon(Icons.swap_horiz_rounded, size: 16),
                    label: Text(
                      _selectedSavedAddress != null ? 'Change' : 'Select',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFF2563EB),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                _selectedSavedAddress != null
                    ? _selectedSavedAddress!.formattedAddress
                    : 'No saved address selected. Tap Select to choose from your saved addresses or fill details below.',
                style: const TextStyle(fontSize: 12, color: Color(0xFF475569), height: 1.3),
              ),
            ],
          ),
        ),
`;

const anchor = '// Mode Selector: Gated Society vs Independent House / Public Address';
if (!code.includes('Saved Address Selection Card (Priority 2)')) {
  code = code.replace(anchor, savedAddressCard + '        ' + anchor);
  console.log('Successfully inserted Saved Address Card into _buildStep3ServiceLocation');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Finished updating book_service_screen.dart');

