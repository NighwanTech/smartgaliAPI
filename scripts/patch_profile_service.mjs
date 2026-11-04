import fs from 'fs';

const filePath = 'C:/flutter/my_first_app/lib/modules/profile/profile_service.dart';
let code = fs.readFileSync(filePath, 'utf8');

const oldAddressModel = `class AddressModel {
  final int id;
  final String label;
  final String? houseNo;
  final String? street;
  final String? landmark;
  final String? city;
  final String? fullAddress;
  final bool isDefault;

  const AddressModel({
    required this.id,
    required this.label,
    this.houseNo,
    this.street,
    this.landmark,
    this.city,
    this.fullAddress,
    required this.isDefault,
  });

  factory AddressModel.fromJson(Map<String, dynamic> json) {
    return AddressModel(
      id: int.tryParse(json['id'].toString()) ?? 0,
      label: (json['label'] ?? 'Home').toString(),
      houseNo: json['houseNo']?.toString(),
      street: json['street']?.toString(),
      landmark: json['landmark']?.toString(),
      city: json['city']?.toString(),
      fullAddress: json['fullAddress']?.toString(),
      isDefault: json['isDefault'] == true,
    );
  }
}`;

const newAddressModel = `class AddressModel {
  final int id;
  final String label;
  final String? houseNo;
  final String? street;
  final String? landmark;
  final String? locality;
  final String? city;
  final String? district;
  final String? state;
  final String? pincode;
  final String? fullAddress;
  final double? latitude;
  final double? longitude;
  final bool isDefault;

  const AddressModel({
    required this.id,
    required this.label,
    this.houseNo,
    this.street,
    this.landmark,
    this.locality,
    this.city,
    this.district,
    this.state,
    this.pincode,
    this.fullAddress,
    this.latitude,
    this.longitude,
    required this.isDefault,
  });

  factory AddressModel.fromJson(Map<String, dynamic> json) {
    return AddressModel(
      id: int.tryParse(json['id'].toString()) ?? 0,
      label: (json['label'] ?? json['addressType'] ?? 'Home').toString(),
      houseNo: (json['houseNo'] ?? json['flatUnit'] ?? json['flat_unit'])?.toString(),
      street: (json['street'] ?? json['streetAddress'] ?? json['street_address'])?.toString(),
      landmark: (json['landmark'] ?? json['buildingName'] ?? json['building_name'])?.toString(),
      locality: json['locality']?.toString(),
      city: json['city']?.toString(),
      district: json['district']?.toString(),
      state: json['state']?.toString(),
      pincode: json['pincode']?.toString(),
      fullAddress: (json['fullAddress'] ?? json['full_address'])?.toString(),
      latitude: json['latitude'] != null ? double.tryParse(json['latitude'].toString()) : null,
      longitude: json['longitude'] != null ? double.tryParse(json['longitude'].toString()) : null,
      isDefault: json['isDefault'] == true || json['is_default'] == true,
    );
  }
}`;

code = code.replace(oldAddressModel, newAddressModel);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated AddressModel in profile_service.dart');

