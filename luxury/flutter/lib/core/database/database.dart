import 'package:drift/drift.dart';

import 'connection/unsupported.dart'
    if (dart.library.io) 'connection/native.dart'
    if (dart.library.js) 'connection/web.dart' as connection;

part 'database.g.dart';

class MenuCategories extends Table {
  IntColumn get id => integer()();
  TextColumn get name => text()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

class MenuItems extends Table {
  IntColumn get id => integer()();
  IntColumn get categoryId => integer()();
  TextColumn get name => text()();
  TextColumn get description => text()();
  RealColumn get price => real()();
  TextColumn get originRegion => text().withDefault(const Constant(''))();
  TextColumn get originCountry => text().withDefault(const Constant(''))();
  BoolColumn get chefPick => boolean().withDefault(const Constant(false))();
  TextColumn get heroImage => text().withDefault(const Constant(''))();
  TextColumn get heroVideo => text().withDefault(const Constant(''))();
  TextColumn get ingredientStory => text().withDefault(const Constant(''))();
  TextColumn get originStory => text().withDefault(const Constant(''))();
  TextColumn get chefStory => text().withDefault(const Constant(''))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

class AppState extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [MenuCategories, MenuItems, AppState])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(connection.openConnection());

  @override
  int get schemaVersion => 1;
}
