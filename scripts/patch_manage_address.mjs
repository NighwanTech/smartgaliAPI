import fs from 'fs';

const filePath = 'C:/flutter/my_first_app/lib/modules/profile/manage_address_screen.dart';
let code = fs.readFileSync(filePath, 'utf8');

// Add imports
if (!code.includes('user_address_model.dart')) {
  code = `import '../../models/user_address_model.dart';\nimport '../address/widgets/address_form_bottom_sheet.dart';\n` + code;
}

// Replace _showAddressSheet
const oldMethodRegex = /Future<void> _showAddressSheet\(\[AddressModel\? existing\]\) async \{[\s\S]*?\n  \}/;

const newMethod = `Future<void> _showAddressSheet([AddressModel? existing]) async {
    final converted = existing != null
        ? UserAddressModel(
            id: existing.id,
            userId: 0,
            addressType: existing.label,
            flatUnit: existing.houseNo,
            buildingName: existing.landmark,
            streetAddress: existing.street,
            locality: existing.locality,
            city: existing.city,
            district: existing.district,
            state: existing.state,
            pincode: existing.pincode,
            latitude: existing.latitude,
            longitude: existing.longitude,
            fullAddress: existing.fullAddress,
            isDefault: existing.isDefault,
          )
        : null;
    final saved = await AddressFormBottomSheet.show(context, existingAddress: converted);
    if (saved != null && mounted) {
      await _loadData();
    }
  }`;

code = code.replace(oldMethodRegex, newMethod);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated manage_address_screen.dart');

