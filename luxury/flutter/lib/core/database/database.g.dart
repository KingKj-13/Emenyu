// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $MenuCategoriesTable extends MenuCategories
    with TableInfo<$MenuCategoriesTable, MenuCategory> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MenuCategoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sortOrderMeta =
      const VerificationMeta('sortOrder');
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
      'sort_order', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  @override
  List<GeneratedColumn> get $columns => [id, name, sortOrder];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'menu_categories';
  @override
  VerificationContext validateIntegrity(Insertable<MenuCategory> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('sort_order')) {
      context.handle(_sortOrderMeta,
          sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MenuCategory map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MenuCategory(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      sortOrder: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}sort_order'])!,
    );
  }

  @override
  $MenuCategoriesTable createAlias(String alias) {
    return $MenuCategoriesTable(attachedDatabase, alias);
  }
}

class MenuCategory extends DataClass implements Insertable<MenuCategory> {
  final int id;
  final String name;
  final int sortOrder;
  const MenuCategory(
      {required this.id, required this.name, required this.sortOrder});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  MenuCategoriesCompanion toCompanion(bool nullToAbsent) {
    return MenuCategoriesCompanion(
      id: Value(id),
      name: Value(name),
      sortOrder: Value(sortOrder),
    );
  }

  factory MenuCategory.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MenuCategory(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  MenuCategory copyWith({int? id, String? name, int? sortOrder}) =>
      MenuCategory(
        id: id ?? this.id,
        name: name ?? this.name,
        sortOrder: sortOrder ?? this.sortOrder,
      );
  MenuCategory copyWithCompanion(MenuCategoriesCompanion data) {
    return MenuCategory(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MenuCategory(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MenuCategory &&
          other.id == this.id &&
          other.name == this.name &&
          other.sortOrder == this.sortOrder);
}

class MenuCategoriesCompanion extends UpdateCompanion<MenuCategory> {
  final Value<int> id;
  final Value<String> name;
  final Value<int> sortOrder;
  const MenuCategoriesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.sortOrder = const Value.absent(),
  });
  MenuCategoriesCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    this.sortOrder = const Value.absent(),
  }) : name = Value(name);
  static Insertable<MenuCategory> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<int>? sortOrder,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (sortOrder != null) 'sort_order': sortOrder,
    });
  }

  MenuCategoriesCompanion copyWith(
      {Value<int>? id, Value<String>? name, Value<int>? sortOrder}) {
    return MenuCategoriesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MenuCategoriesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }
}

class $MenuItemsTable extends MenuItems
    with TableInfo<$MenuItemsTable, MenuItem> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MenuItemsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _categoryIdMeta =
      const VerificationMeta('categoryId');
  @override
  late final GeneratedColumn<int> categoryId = GeneratedColumn<int>(
      'category_id', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _descriptionMeta =
      const VerificationMeta('description');
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
      'description', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _priceMeta = const VerificationMeta('price');
  @override
  late final GeneratedColumn<double> price = GeneratedColumn<double>(
      'price', aliasedName, false,
      type: DriftSqlType.double, requiredDuringInsert: true);
  static const VerificationMeta _originRegionMeta =
      const VerificationMeta('originRegion');
  @override
  late final GeneratedColumn<String> originRegion = GeneratedColumn<String>(
      'origin_region', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _originCountryMeta =
      const VerificationMeta('originCountry');
  @override
  late final GeneratedColumn<String> originCountry = GeneratedColumn<String>(
      'origin_country', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _chefPickMeta =
      const VerificationMeta('chefPick');
  @override
  late final GeneratedColumn<bool> chefPick = GeneratedColumn<bool>(
      'chef_pick', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("chef_pick" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _heroImageMeta =
      const VerificationMeta('heroImage');
  @override
  late final GeneratedColumn<String> heroImage = GeneratedColumn<String>(
      'hero_image', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _heroVideoMeta =
      const VerificationMeta('heroVideo');
  @override
  late final GeneratedColumn<String> heroVideo = GeneratedColumn<String>(
      'hero_video', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _ingredientStoryMeta =
      const VerificationMeta('ingredientStory');
  @override
  late final GeneratedColumn<String> ingredientStory = GeneratedColumn<String>(
      'ingredient_story', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _originStoryMeta =
      const VerificationMeta('originStory');
  @override
  late final GeneratedColumn<String> originStory = GeneratedColumn<String>(
      'origin_story', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _chefStoryMeta =
      const VerificationMeta('chefStory');
  @override
  late final GeneratedColumn<String> chefStory = GeneratedColumn<String>(
      'chef_story', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _sortOrderMeta =
      const VerificationMeta('sortOrder');
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
      'sort_order', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        categoryId,
        name,
        description,
        price,
        originRegion,
        originCountry,
        chefPick,
        heroImage,
        heroVideo,
        ingredientStory,
        originStory,
        chefStory,
        sortOrder
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'menu_items';
  @override
  VerificationContext validateIntegrity(Insertable<MenuItem> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('category_id')) {
      context.handle(
          _categoryIdMeta,
          categoryId.isAcceptableOrUnknown(
              data['category_id']!, _categoryIdMeta));
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('description')) {
      context.handle(
          _descriptionMeta,
          description.isAcceptableOrUnknown(
              data['description']!, _descriptionMeta));
    } else if (isInserting) {
      context.missing(_descriptionMeta);
    }
    if (data.containsKey('price')) {
      context.handle(
          _priceMeta, price.isAcceptableOrUnknown(data['price']!, _priceMeta));
    } else if (isInserting) {
      context.missing(_priceMeta);
    }
    if (data.containsKey('origin_region')) {
      context.handle(
          _originRegionMeta,
          originRegion.isAcceptableOrUnknown(
              data['origin_region']!, _originRegionMeta));
    }
    if (data.containsKey('origin_country')) {
      context.handle(
          _originCountryMeta,
          originCountry.isAcceptableOrUnknown(
              data['origin_country']!, _originCountryMeta));
    }
    if (data.containsKey('chef_pick')) {
      context.handle(_chefPickMeta,
          chefPick.isAcceptableOrUnknown(data['chef_pick']!, _chefPickMeta));
    }
    if (data.containsKey('hero_image')) {
      context.handle(_heroImageMeta,
          heroImage.isAcceptableOrUnknown(data['hero_image']!, _heroImageMeta));
    }
    if (data.containsKey('hero_video')) {
      context.handle(_heroVideoMeta,
          heroVideo.isAcceptableOrUnknown(data['hero_video']!, _heroVideoMeta));
    }
    if (data.containsKey('ingredient_story')) {
      context.handle(
          _ingredientStoryMeta,
          ingredientStory.isAcceptableOrUnknown(
              data['ingredient_story']!, _ingredientStoryMeta));
    }
    if (data.containsKey('origin_story')) {
      context.handle(
          _originStoryMeta,
          originStory.isAcceptableOrUnknown(
              data['origin_story']!, _originStoryMeta));
    }
    if (data.containsKey('chef_story')) {
      context.handle(_chefStoryMeta,
          chefStory.isAcceptableOrUnknown(data['chef_story']!, _chefStoryMeta));
    }
    if (data.containsKey('sort_order')) {
      context.handle(_sortOrderMeta,
          sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MenuItem map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MenuItem(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      categoryId: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}category_id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      description: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}description'])!,
      price: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}price'])!,
      originRegion: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}origin_region'])!,
      originCountry: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}origin_country'])!,
      chefPick: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}chef_pick'])!,
      heroImage: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}hero_image'])!,
      heroVideo: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}hero_video'])!,
      ingredientStory: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}ingredient_story'])!,
      originStory: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}origin_story'])!,
      chefStory: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}chef_story'])!,
      sortOrder: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}sort_order'])!,
    );
  }

  @override
  $MenuItemsTable createAlias(String alias) {
    return $MenuItemsTable(attachedDatabase, alias);
  }
}

class MenuItem extends DataClass implements Insertable<MenuItem> {
  final int id;
  final int categoryId;
  final String name;
  final String description;
  final double price;
  final String originRegion;
  final String originCountry;
  final bool chefPick;
  final String heroImage;
  final String heroVideo;
  final String ingredientStory;
  final String originStory;
  final String chefStory;
  final int sortOrder;
  const MenuItem(
      {required this.id,
      required this.categoryId,
      required this.name,
      required this.description,
      required this.price,
      required this.originRegion,
      required this.originCountry,
      required this.chefPick,
      required this.heroImage,
      required this.heroVideo,
      required this.ingredientStory,
      required this.originStory,
      required this.chefStory,
      required this.sortOrder});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['category_id'] = Variable<int>(categoryId);
    map['name'] = Variable<String>(name);
    map['description'] = Variable<String>(description);
    map['price'] = Variable<double>(price);
    map['origin_region'] = Variable<String>(originRegion);
    map['origin_country'] = Variable<String>(originCountry);
    map['chef_pick'] = Variable<bool>(chefPick);
    map['hero_image'] = Variable<String>(heroImage);
    map['hero_video'] = Variable<String>(heroVideo);
    map['ingredient_story'] = Variable<String>(ingredientStory);
    map['origin_story'] = Variable<String>(originStory);
    map['chef_story'] = Variable<String>(chefStory);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  MenuItemsCompanion toCompanion(bool nullToAbsent) {
    return MenuItemsCompanion(
      id: Value(id),
      categoryId: Value(categoryId),
      name: Value(name),
      description: Value(description),
      price: Value(price),
      originRegion: Value(originRegion),
      originCountry: Value(originCountry),
      chefPick: Value(chefPick),
      heroImage: Value(heroImage),
      heroVideo: Value(heroVideo),
      ingredientStory: Value(ingredientStory),
      originStory: Value(originStory),
      chefStory: Value(chefStory),
      sortOrder: Value(sortOrder),
    );
  }

  factory MenuItem.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MenuItem(
      id: serializer.fromJson<int>(json['id']),
      categoryId: serializer.fromJson<int>(json['categoryId']),
      name: serializer.fromJson<String>(json['name']),
      description: serializer.fromJson<String>(json['description']),
      price: serializer.fromJson<double>(json['price']),
      originRegion: serializer.fromJson<String>(json['originRegion']),
      originCountry: serializer.fromJson<String>(json['originCountry']),
      chefPick: serializer.fromJson<bool>(json['chefPick']),
      heroImage: serializer.fromJson<String>(json['heroImage']),
      heroVideo: serializer.fromJson<String>(json['heroVideo']),
      ingredientStory: serializer.fromJson<String>(json['ingredientStory']),
      originStory: serializer.fromJson<String>(json['originStory']),
      chefStory: serializer.fromJson<String>(json['chefStory']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'categoryId': serializer.toJson<int>(categoryId),
      'name': serializer.toJson<String>(name),
      'description': serializer.toJson<String>(description),
      'price': serializer.toJson<double>(price),
      'originRegion': serializer.toJson<String>(originRegion),
      'originCountry': serializer.toJson<String>(originCountry),
      'chefPick': serializer.toJson<bool>(chefPick),
      'heroImage': serializer.toJson<String>(heroImage),
      'heroVideo': serializer.toJson<String>(heroVideo),
      'ingredientStory': serializer.toJson<String>(ingredientStory),
      'originStory': serializer.toJson<String>(originStory),
      'chefStory': serializer.toJson<String>(chefStory),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  MenuItem copyWith(
          {int? id,
          int? categoryId,
          String? name,
          String? description,
          double? price,
          String? originRegion,
          String? originCountry,
          bool? chefPick,
          String? heroImage,
          String? heroVideo,
          String? ingredientStory,
          String? originStory,
          String? chefStory,
          int? sortOrder}) =>
      MenuItem(
        id: id ?? this.id,
        categoryId: categoryId ?? this.categoryId,
        name: name ?? this.name,
        description: description ?? this.description,
        price: price ?? this.price,
        originRegion: originRegion ?? this.originRegion,
        originCountry: originCountry ?? this.originCountry,
        chefPick: chefPick ?? this.chefPick,
        heroImage: heroImage ?? this.heroImage,
        heroVideo: heroVideo ?? this.heroVideo,
        ingredientStory: ingredientStory ?? this.ingredientStory,
        originStory: originStory ?? this.originStory,
        chefStory: chefStory ?? this.chefStory,
        sortOrder: sortOrder ?? this.sortOrder,
      );
  MenuItem copyWithCompanion(MenuItemsCompanion data) {
    return MenuItem(
      id: data.id.present ? data.id.value : this.id,
      categoryId:
          data.categoryId.present ? data.categoryId.value : this.categoryId,
      name: data.name.present ? data.name.value : this.name,
      description:
          data.description.present ? data.description.value : this.description,
      price: data.price.present ? data.price.value : this.price,
      originRegion: data.originRegion.present
          ? data.originRegion.value
          : this.originRegion,
      originCountry: data.originCountry.present
          ? data.originCountry.value
          : this.originCountry,
      chefPick: data.chefPick.present ? data.chefPick.value : this.chefPick,
      heroImage: data.heroImage.present ? data.heroImage.value : this.heroImage,
      heroVideo: data.heroVideo.present ? data.heroVideo.value : this.heroVideo,
      ingredientStory: data.ingredientStory.present
          ? data.ingredientStory.value
          : this.ingredientStory,
      originStory:
          data.originStory.present ? data.originStory.value : this.originStory,
      chefStory: data.chefStory.present ? data.chefStory.value : this.chefStory,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MenuItem(')
          ..write('id: $id, ')
          ..write('categoryId: $categoryId, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('price: $price, ')
          ..write('originRegion: $originRegion, ')
          ..write('originCountry: $originCountry, ')
          ..write('chefPick: $chefPick, ')
          ..write('heroImage: $heroImage, ')
          ..write('heroVideo: $heroVideo, ')
          ..write('ingredientStory: $ingredientStory, ')
          ..write('originStory: $originStory, ')
          ..write('chefStory: $chefStory, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      categoryId,
      name,
      description,
      price,
      originRegion,
      originCountry,
      chefPick,
      heroImage,
      heroVideo,
      ingredientStory,
      originStory,
      chefStory,
      sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MenuItem &&
          other.id == this.id &&
          other.categoryId == this.categoryId &&
          other.name == this.name &&
          other.description == this.description &&
          other.price == this.price &&
          other.originRegion == this.originRegion &&
          other.originCountry == this.originCountry &&
          other.chefPick == this.chefPick &&
          other.heroImage == this.heroImage &&
          other.heroVideo == this.heroVideo &&
          other.ingredientStory == this.ingredientStory &&
          other.originStory == this.originStory &&
          other.chefStory == this.chefStory &&
          other.sortOrder == this.sortOrder);
}

class MenuItemsCompanion extends UpdateCompanion<MenuItem> {
  final Value<int> id;
  final Value<int> categoryId;
  final Value<String> name;
  final Value<String> description;
  final Value<double> price;
  final Value<String> originRegion;
  final Value<String> originCountry;
  final Value<bool> chefPick;
  final Value<String> heroImage;
  final Value<String> heroVideo;
  final Value<String> ingredientStory;
  final Value<String> originStory;
  final Value<String> chefStory;
  final Value<int> sortOrder;
  const MenuItemsCompanion({
    this.id = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.name = const Value.absent(),
    this.description = const Value.absent(),
    this.price = const Value.absent(),
    this.originRegion = const Value.absent(),
    this.originCountry = const Value.absent(),
    this.chefPick = const Value.absent(),
    this.heroImage = const Value.absent(),
    this.heroVideo = const Value.absent(),
    this.ingredientStory = const Value.absent(),
    this.originStory = const Value.absent(),
    this.chefStory = const Value.absent(),
    this.sortOrder = const Value.absent(),
  });
  MenuItemsCompanion.insert({
    this.id = const Value.absent(),
    required int categoryId,
    required String name,
    required String description,
    required double price,
    this.originRegion = const Value.absent(),
    this.originCountry = const Value.absent(),
    this.chefPick = const Value.absent(),
    this.heroImage = const Value.absent(),
    this.heroVideo = const Value.absent(),
    this.ingredientStory = const Value.absent(),
    this.originStory = const Value.absent(),
    this.chefStory = const Value.absent(),
    this.sortOrder = const Value.absent(),
  })  : categoryId = Value(categoryId),
        name = Value(name),
        description = Value(description),
        price = Value(price);
  static Insertable<MenuItem> custom({
    Expression<int>? id,
    Expression<int>? categoryId,
    Expression<String>? name,
    Expression<String>? description,
    Expression<double>? price,
    Expression<String>? originRegion,
    Expression<String>? originCountry,
    Expression<bool>? chefPick,
    Expression<String>? heroImage,
    Expression<String>? heroVideo,
    Expression<String>? ingredientStory,
    Expression<String>? originStory,
    Expression<String>? chefStory,
    Expression<int>? sortOrder,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (categoryId != null) 'category_id': categoryId,
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (price != null) 'price': price,
      if (originRegion != null) 'origin_region': originRegion,
      if (originCountry != null) 'origin_country': originCountry,
      if (chefPick != null) 'chef_pick': chefPick,
      if (heroImage != null) 'hero_image': heroImage,
      if (heroVideo != null) 'hero_video': heroVideo,
      if (ingredientStory != null) 'ingredient_story': ingredientStory,
      if (originStory != null) 'origin_story': originStory,
      if (chefStory != null) 'chef_story': chefStory,
      if (sortOrder != null) 'sort_order': sortOrder,
    });
  }

  MenuItemsCompanion copyWith(
      {Value<int>? id,
      Value<int>? categoryId,
      Value<String>? name,
      Value<String>? description,
      Value<double>? price,
      Value<String>? originRegion,
      Value<String>? originCountry,
      Value<bool>? chefPick,
      Value<String>? heroImage,
      Value<String>? heroVideo,
      Value<String>? ingredientStory,
      Value<String>? originStory,
      Value<String>? chefStory,
      Value<int>? sortOrder}) {
    return MenuItemsCompanion(
      id: id ?? this.id,
      categoryId: categoryId ?? this.categoryId,
      name: name ?? this.name,
      description: description ?? this.description,
      price: price ?? this.price,
      originRegion: originRegion ?? this.originRegion,
      originCountry: originCountry ?? this.originCountry,
      chefPick: chefPick ?? this.chefPick,
      heroImage: heroImage ?? this.heroImage,
      heroVideo: heroVideo ?? this.heroVideo,
      ingredientStory: ingredientStory ?? this.ingredientStory,
      originStory: originStory ?? this.originStory,
      chefStory: chefStory ?? this.chefStory,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<int>(categoryId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (price.present) {
      map['price'] = Variable<double>(price.value);
    }
    if (originRegion.present) {
      map['origin_region'] = Variable<String>(originRegion.value);
    }
    if (originCountry.present) {
      map['origin_country'] = Variable<String>(originCountry.value);
    }
    if (chefPick.present) {
      map['chef_pick'] = Variable<bool>(chefPick.value);
    }
    if (heroImage.present) {
      map['hero_image'] = Variable<String>(heroImage.value);
    }
    if (heroVideo.present) {
      map['hero_video'] = Variable<String>(heroVideo.value);
    }
    if (ingredientStory.present) {
      map['ingredient_story'] = Variable<String>(ingredientStory.value);
    }
    if (originStory.present) {
      map['origin_story'] = Variable<String>(originStory.value);
    }
    if (chefStory.present) {
      map['chef_story'] = Variable<String>(chefStory.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MenuItemsCompanion(')
          ..write('id: $id, ')
          ..write('categoryId: $categoryId, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('price: $price, ')
          ..write('originRegion: $originRegion, ')
          ..write('originCountry: $originCountry, ')
          ..write('chefPick: $chefPick, ')
          ..write('heroImage: $heroImage, ')
          ..write('heroVideo: $heroVideo, ')
          ..write('ingredientStory: $ingredientStory, ')
          ..write('originStory: $originStory, ')
          ..write('chefStory: $chefStory, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }
}

class $AppStateTable extends AppState
    with TableInfo<$AppStateTable, AppStateData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AppStateTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
      'key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
      'value', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'app_state';
  @override
  VerificationContext validateIntegrity(Insertable<AppStateData> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
          _keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
          _valueMeta, value.isAcceptableOrUnknown(data['value']!, _valueMeta));
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  AppStateData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AppStateData(
      key: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      value: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}value'])!,
    );
  }

  @override
  $AppStateTable createAlias(String alias) {
    return $AppStateTable(attachedDatabase, alias);
  }
}

class AppStateData extends DataClass implements Insertable<AppStateData> {
  final String key;
  final String value;
  const AppStateData({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  AppStateCompanion toCompanion(bool nullToAbsent) {
    return AppStateCompanion(
      key: Value(key),
      value: Value(value),
    );
  }

  factory AppStateData.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AppStateData(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  AppStateData copyWith({String? key, String? value}) => AppStateData(
        key: key ?? this.key,
        value: value ?? this.value,
      );
  AppStateData copyWithCompanion(AppStateCompanion data) {
    return AppStateData(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AppStateData(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AppStateData &&
          other.key == this.key &&
          other.value == this.value);
}

class AppStateCompanion extends UpdateCompanion<AppStateData> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const AppStateCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AppStateCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  })  : key = Value(key),
        value = Value(value);
  static Insertable<AppStateData> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AppStateCompanion copyWith(
      {Value<String>? key, Value<String>? value, Value<int>? rowid}) {
    return AppStateCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AppStateCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $MenuCategoriesTable menuCategories = $MenuCategoriesTable(this);
  late final $MenuItemsTable menuItems = $MenuItemsTable(this);
  late final $AppStateTable appState = $AppStateTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities =>
      [menuCategories, menuItems, appState];
}

typedef $$MenuCategoriesTableCreateCompanionBuilder = MenuCategoriesCompanion
    Function({
  Value<int> id,
  required String name,
  Value<int> sortOrder,
});
typedef $$MenuCategoriesTableUpdateCompanionBuilder = MenuCategoriesCompanion
    Function({
  Value<int> id,
  Value<String> name,
  Value<int> sortOrder,
});

class $$MenuCategoriesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $MenuCategoriesTable,
    MenuCategory,
    $$MenuCategoriesTableFilterComposer,
    $$MenuCategoriesTableOrderingComposer,
    $$MenuCategoriesTableCreateCompanionBuilder,
    $$MenuCategoriesTableUpdateCompanionBuilder> {
  $$MenuCategoriesTableTableManager(
      _$AppDatabase db, $MenuCategoriesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$MenuCategoriesTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$MenuCategoriesTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<int> sortOrder = const Value.absent(),
          }) =>
              MenuCategoriesCompanion(
            id: id,
            name: name,
            sortOrder: sortOrder,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required String name,
            Value<int> sortOrder = const Value.absent(),
          }) =>
              MenuCategoriesCompanion.insert(
            id: id,
            name: name,
            sortOrder: sortOrder,
          ),
        ));
}

class $$MenuCategoriesTableFilterComposer
    extends FilterComposer<_$AppDatabase, $MenuCategoriesTable> {
  $$MenuCategoriesTableFilterComposer(super.$state);
  ColumnFilters<int> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get sortOrder => $state.composableBuilder(
      column: $state.table.sortOrder,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$MenuCategoriesTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $MenuCategoriesTable> {
  $$MenuCategoriesTableOrderingComposer(super.$state);
  ColumnOrderings<int> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get sortOrder => $state.composableBuilder(
      column: $state.table.sortOrder,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$MenuItemsTableCreateCompanionBuilder = MenuItemsCompanion Function({
  Value<int> id,
  required int categoryId,
  required String name,
  required String description,
  required double price,
  Value<String> originRegion,
  Value<String> originCountry,
  Value<bool> chefPick,
  Value<String> heroImage,
  Value<String> heroVideo,
  Value<String> ingredientStory,
  Value<String> originStory,
  Value<String> chefStory,
  Value<int> sortOrder,
});
typedef $$MenuItemsTableUpdateCompanionBuilder = MenuItemsCompanion Function({
  Value<int> id,
  Value<int> categoryId,
  Value<String> name,
  Value<String> description,
  Value<double> price,
  Value<String> originRegion,
  Value<String> originCountry,
  Value<bool> chefPick,
  Value<String> heroImage,
  Value<String> heroVideo,
  Value<String> ingredientStory,
  Value<String> originStory,
  Value<String> chefStory,
  Value<int> sortOrder,
});

class $$MenuItemsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $MenuItemsTable,
    MenuItem,
    $$MenuItemsTableFilterComposer,
    $$MenuItemsTableOrderingComposer,
    $$MenuItemsTableCreateCompanionBuilder,
    $$MenuItemsTableUpdateCompanionBuilder> {
  $$MenuItemsTableTableManager(_$AppDatabase db, $MenuItemsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$MenuItemsTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$MenuItemsTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<int> categoryId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> description = const Value.absent(),
            Value<double> price = const Value.absent(),
            Value<String> originRegion = const Value.absent(),
            Value<String> originCountry = const Value.absent(),
            Value<bool> chefPick = const Value.absent(),
            Value<String> heroImage = const Value.absent(),
            Value<String> heroVideo = const Value.absent(),
            Value<String> ingredientStory = const Value.absent(),
            Value<String> originStory = const Value.absent(),
            Value<String> chefStory = const Value.absent(),
            Value<int> sortOrder = const Value.absent(),
          }) =>
              MenuItemsCompanion(
            id: id,
            categoryId: categoryId,
            name: name,
            description: description,
            price: price,
            originRegion: originRegion,
            originCountry: originCountry,
            chefPick: chefPick,
            heroImage: heroImage,
            heroVideo: heroVideo,
            ingredientStory: ingredientStory,
            originStory: originStory,
            chefStory: chefStory,
            sortOrder: sortOrder,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required int categoryId,
            required String name,
            required String description,
            required double price,
            Value<String> originRegion = const Value.absent(),
            Value<String> originCountry = const Value.absent(),
            Value<bool> chefPick = const Value.absent(),
            Value<String> heroImage = const Value.absent(),
            Value<String> heroVideo = const Value.absent(),
            Value<String> ingredientStory = const Value.absent(),
            Value<String> originStory = const Value.absent(),
            Value<String> chefStory = const Value.absent(),
            Value<int> sortOrder = const Value.absent(),
          }) =>
              MenuItemsCompanion.insert(
            id: id,
            categoryId: categoryId,
            name: name,
            description: description,
            price: price,
            originRegion: originRegion,
            originCountry: originCountry,
            chefPick: chefPick,
            heroImage: heroImage,
            heroVideo: heroVideo,
            ingredientStory: ingredientStory,
            originStory: originStory,
            chefStory: chefStory,
            sortOrder: sortOrder,
          ),
        ));
}

class $$MenuItemsTableFilterComposer
    extends FilterComposer<_$AppDatabase, $MenuItemsTable> {
  $$MenuItemsTableFilterComposer(super.$state);
  ColumnFilters<int> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get categoryId => $state.composableBuilder(
      column: $state.table.categoryId,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get description => $state.composableBuilder(
      column: $state.table.description,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<double> get price => $state.composableBuilder(
      column: $state.table.price,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get originRegion => $state.composableBuilder(
      column: $state.table.originRegion,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get originCountry => $state.composableBuilder(
      column: $state.table.originCountry,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<bool> get chefPick => $state.composableBuilder(
      column: $state.table.chefPick,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get heroImage => $state.composableBuilder(
      column: $state.table.heroImage,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get heroVideo => $state.composableBuilder(
      column: $state.table.heroVideo,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get ingredientStory => $state.composableBuilder(
      column: $state.table.ingredientStory,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get originStory => $state.composableBuilder(
      column: $state.table.originStory,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get chefStory => $state.composableBuilder(
      column: $state.table.chefStory,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<int> get sortOrder => $state.composableBuilder(
      column: $state.table.sortOrder,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$MenuItemsTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $MenuItemsTable> {
  $$MenuItemsTableOrderingComposer(super.$state);
  ColumnOrderings<int> get id => $state.composableBuilder(
      column: $state.table.id,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get categoryId => $state.composableBuilder(
      column: $state.table.categoryId,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get name => $state.composableBuilder(
      column: $state.table.name,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get description => $state.composableBuilder(
      column: $state.table.description,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<double> get price => $state.composableBuilder(
      column: $state.table.price,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get originRegion => $state.composableBuilder(
      column: $state.table.originRegion,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get originCountry => $state.composableBuilder(
      column: $state.table.originCountry,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<bool> get chefPick => $state.composableBuilder(
      column: $state.table.chefPick,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get heroImage => $state.composableBuilder(
      column: $state.table.heroImage,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get heroVideo => $state.composableBuilder(
      column: $state.table.heroVideo,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get ingredientStory => $state.composableBuilder(
      column: $state.table.ingredientStory,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get originStory => $state.composableBuilder(
      column: $state.table.originStory,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get chefStory => $state.composableBuilder(
      column: $state.table.chefStory,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<int> get sortOrder => $state.composableBuilder(
      column: $state.table.sortOrder,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

typedef $$AppStateTableCreateCompanionBuilder = AppStateCompanion Function({
  required String key,
  required String value,
  Value<int> rowid,
});
typedef $$AppStateTableUpdateCompanionBuilder = AppStateCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<int> rowid,
});

class $$AppStateTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AppStateTable,
    AppStateData,
    $$AppStateTableFilterComposer,
    $$AppStateTableOrderingComposer,
    $$AppStateTableCreateCompanionBuilder,
    $$AppStateTableUpdateCompanionBuilder> {
  $$AppStateTableTableManager(_$AppDatabase db, $AppStateTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          filteringComposer:
              $$AppStateTableFilterComposer(ComposerState(db, table)),
          orderingComposer:
              $$AppStateTableOrderingComposer(ComposerState(db, table)),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AppStateCompanion(
            key: key,
            value: value,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String key,
            required String value,
            Value<int> rowid = const Value.absent(),
          }) =>
              AppStateCompanion.insert(
            key: key,
            value: value,
            rowid: rowid,
          ),
        ));
}

class $$AppStateTableFilterComposer
    extends FilterComposer<_$AppDatabase, $AppStateTable> {
  $$AppStateTableFilterComposer(super.$state);
  ColumnFilters<String> get key => $state.composableBuilder(
      column: $state.table.key,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));

  ColumnFilters<String> get value => $state.composableBuilder(
      column: $state.table.value,
      builder: (column, joinBuilders) =>
          ColumnFilters(column, joinBuilders: joinBuilders));
}

class $$AppStateTableOrderingComposer
    extends OrderingComposer<_$AppDatabase, $AppStateTable> {
  $$AppStateTableOrderingComposer(super.$state);
  ColumnOrderings<String> get key => $state.composableBuilder(
      column: $state.table.key,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));

  ColumnOrderings<String> get value => $state.composableBuilder(
      column: $state.table.value,
      builder: (column, joinBuilders) =>
          ColumnOrderings(column, joinBuilders: joinBuilders));
}

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$MenuCategoriesTableTableManager get menuCategories =>
      $$MenuCategoriesTableTableManager(_db, _db.menuCategories);
  $$MenuItemsTableTableManager get menuItems =>
      $$MenuItemsTableTableManager(_db, _db.menuItems);
  $$AppStateTableTableManager get appState =>
      $$AppStateTableTableManager(_db, _db.appState);
}
