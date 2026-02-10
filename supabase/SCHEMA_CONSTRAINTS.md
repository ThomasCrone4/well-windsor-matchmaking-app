# Schema Constraints

Add Query 2 results here (primary keys, foreign keys, unique constraints)
| constraint_schema | constraint_name                            | table_name             | constraint_type | column_name    |
| ----------------- | ------------------------------------------ | ---------------------- | --------------- | -------------- |
| public            | 2200_74670_1_not_null                      | admins                 | CHECK           | null           |
| public            | admins_user_id_fkey                        | admins                 | FOREIGN KEY     | user_id        |
| public            | admins_pkey                                | admins                 | PRIMARY KEY     | user_id        |
| public            | 2200_17347_1_not_null                      | applications           | CHECK           | null           |
| public            | 2200_17347_3_not_null                      | applications           | CHECK           | null           |
| public            | 2200_17347_5_not_null                      | applications           | CHECK           | null           |
| public            | 2200_17347_7_not_null                      | applications           | CHECK           | null           |
| public            | 2200_17347_8_not_null                      | applications           | CHECK           | null           |
| public            | applications_direction_check               | applications           | CHECK           | null           |
| public            | applications_opportunity_id_fkey           | applications           | FOREIGN KEY     | opportunity_id |
| public            | applications_org_id_fkey                   | applications           | FOREIGN KEY     | org_id         |
| public            | applications_volunteer_id_fkey             | applications           | FOREIGN KEY     | volunteer_id   |
| public            | applications_pkey                          | applications           | PRIMARY KEY     | id             |
| public            | 2200_124414_1_not_null                     | audit_logs             | CHECK           | null           |
| public            | 2200_124414_2_not_null                     | audit_logs             | CHECK           | null           |
| public            | 2200_124414_3_not_null                     | audit_logs             | CHECK           | null           |
| public            | audit_logs_admin_id_fkey                   | audit_logs             | FOREIGN KEY     | admin_id       |
| public            | audit_logs_target_user_id_fkey             | audit_logs             | FOREIGN KEY     | target_user_id |
| public            | audit_logs_pkey                            | audit_logs             | PRIMARY KEY     | id             |
| public            | 2200_124391_1_not_null                     | match_results          | CHECK           | null           |
| public            | 2200_124391_2_not_null                     | match_results          | CHECK           | null           |
| public            | 2200_124391_3_not_null                     | match_results          | CHECK           | null           |
| public            | 2200_124391_4_not_null                     | match_results          | CHECK           | null           |
| public            | match_results_opportunity_id_fkey          | match_results          | FOREIGN KEY     | opportunity_id |
| public            | match_results_volunteer_id_fkey            | match_results          | FOREIGN KEY     | volunteer_id   |
| public            | match_results_pkey                         | match_results          | PRIMARY KEY     | id             |
| realtime          | 17012_17394_1_not_null                     | messages               | CHECK           | null           |
| realtime          | 17012_17394_2_not_null                     | messages               | CHECK           | null           |
| realtime          | 17012_17394_6_not_null                     | messages               | CHECK           | null           |
| realtime          | 17012_17394_7_not_null                     | messages               | CHECK           | null           |
| realtime          | 17012_17394_8_not_null                     | messages               | CHECK           | null           |
| realtime          | messages_pkey                              | messages               | PRIMARY KEY     | id             |
| realtime          | messages_pkey                              | messages               | PRIMARY KEY     | inserted_at    |
| realtime          | 17012_123999_1_not_null                    | messages_2026_02_08    | CHECK           | null           |
| realtime          | 17012_123999_2_not_null                    | messages_2026_02_08    | CHECK           | null           |
| realtime          | 17012_123999_6_not_null                    | messages_2026_02_08    | CHECK           | null           |
| realtime          | 17012_123999_7_not_null                    | messages_2026_02_08    | CHECK           | null           |
| realtime          | 17012_123999_8_not_null                    | messages_2026_02_08    | CHECK           | null           |
| realtime          | messages_2026_02_08_pkey                   | messages_2026_02_08    | PRIMARY KEY     | id             |
| realtime          | messages_2026_02_08_pkey                   | messages_2026_02_08    | PRIMARY KEY     | inserted_at    |
| realtime          | 17012_124011_1_not_null                    | messages_2026_02_09    | CHECK           | null           |
| realtime          | 17012_124011_2_not_null                    | messages_2026_02_09    | CHECK           | null           |
| realtime          | 17012_124011_6_not_null                    | messages_2026_02_09    | CHECK           | null           |
| realtime          | 17012_124011_7_not_null                    | messages_2026_02_09    | CHECK           | null           |
| realtime          | 17012_124011_8_not_null                    | messages_2026_02_09    | CHECK           | null           |
| realtime          | messages_2026_02_09_pkey                   | messages_2026_02_09    | PRIMARY KEY     | inserted_at    |
| realtime          | messages_2026_02_09_pkey                   | messages_2026_02_09    | PRIMARY KEY     | id             |
| realtime          | 17012_124023_1_not_null                    | messages_2026_02_10    | CHECK           | null           |
| realtime          | 17012_124023_2_not_null                    | messages_2026_02_10    | CHECK           | null           |
| realtime          | 17012_124023_6_not_null                    | messages_2026_02_10    | CHECK           | null           |
| realtime          | 17012_124023_7_not_null                    | messages_2026_02_10    | CHECK           | null           |
| realtime          | 17012_124023_8_not_null                    | messages_2026_02_10    | CHECK           | null           |
| realtime          | messages_2026_02_10_pkey                   | messages_2026_02_10    | PRIMARY KEY     | id             |
| realtime          | messages_2026_02_10_pkey                   | messages_2026_02_10    | PRIMARY KEY     | inserted_at    |
| realtime          | 17012_124035_1_not_null                    | messages_2026_02_11    | CHECK           | null           |
| realtime          | 17012_124035_2_not_null                    | messages_2026_02_11    | CHECK           | null           |
| realtime          | 17012_124035_6_not_null                    | messages_2026_02_11    | CHECK           | null           |
| realtime          | 17012_124035_7_not_null                    | messages_2026_02_11    | CHECK           | null           |
| realtime          | 17012_124035_8_not_null                    | messages_2026_02_11    | CHECK           | null           |
| realtime          | messages_2026_02_11_pkey                   | messages_2026_02_11    | PRIMARY KEY     | inserted_at    |
| realtime          | messages_2026_02_11_pkey                   | messages_2026_02_11    | PRIMARY KEY     | id             |
| realtime          | 17012_124047_1_not_null                    | messages_2026_02_12    | CHECK           | null           |
| realtime          | 17012_124047_2_not_null                    | messages_2026_02_12    | CHECK           | null           |
| realtime          | 17012_124047_6_not_null                    | messages_2026_02_12    | CHECK           | null           |
| realtime          | 17012_124047_7_not_null                    | messages_2026_02_12    | CHECK           | null           |
| realtime          | 17012_124047_8_not_null                    | messages_2026_02_12    | CHECK           | null           |
| realtime          | messages_2026_02_12_pkey                   | messages_2026_02_12    | PRIMARY KEY     | id             |
| realtime          | messages_2026_02_12_pkey                   | messages_2026_02_12    | PRIMARY KEY     | inserted_at    |
| public            | 2200_123958_1_not_null                     | notifications          | CHECK           | null           |
| public            | 2200_123958_2_not_null                     | notifications          | CHECK           | null           |
| public            | 2200_123958_3_not_null                     | notifications          | CHECK           | null           |
| public            | 2200_123958_5_not_null                     | notifications          | CHECK           | null           |
| public            | notifications_user_id_fkey                 | notifications          | FOREIGN KEY     | user_id        |
| public            | notifications_pkey                         | notifications          | PRIMARY KEY     | id             |
| public            | 2200_60423_1_not_null                      | opportunity_timeblocks | CHECK           | null           |
| public            | 2200_60423_2_not_null                      | opportunity_timeblocks | CHECK           | null           |
| public            | 2200_60423_5_not_null                      | opportunity_timeblocks | CHECK           | null           |
| public            | 2200_60423_6_not_null                      | opportunity_timeblocks | CHECK           | null           |
| public            | 2200_60423_7_not_null                      | opportunity_timeblocks | CHECK           | null           |
| public            | opportunity_timeblocks_opportunity_id_fkey | opportunity_timeblocks | FOREIGN KEY     | opportunity_id |
| public            | opportunity_timeblocks_pkey                | opportunity_timeblocks | PRIMARY KEY     | id             |
| realtime          | 17012_17401_1_not_null                     | schema_migrations      | CHECK           | null           |
| realtime          | schema_migrations_pkey                     | schema_migrations      | PRIMARY KEY     | version        |
| vault             | 17014_17103_1_not_null                     | secrets                | CHECK           | null           |
| vault             | 17014_17103_3_not_null                     | secrets                | CHECK           | null           |
| vault             | 17014_17103_4_not_null                     | secrets                | CHECK           | null           |
| vault             | 17014_17103_7_not_null                     | secrets                | CHECK           | null           |
| vault             | 17014_17103_8_not_null                     | secrets                | CHECK           | null           |
| vault             | secrets_pkey                               | secrets                | PRIMARY KEY     | id             |
| public            | 2200_124458_1_not_null                     | site_settings          | CHECK           | null           |
| public            | only_one_row                               | site_settings          | CHECK           | null           |
| public            | site_settings_updated_by_fkey              | site_settings          | FOREIGN KEY     | updated_by     |
| public            | site_settings_pkey                         | site_settings          | PRIMARY KEY     | id             |
| realtime          | 17012_17404_1_not_null                     | subscription           | CHECK           | null           |
| realtime          | 17012_17404_2_not_null                     | subscription           | CHECK           | null           |
| realtime          | 17012_17404_3_not_null                     | subscription           | CHECK           | null           |
| realtime          | 17012_17404_4_not_null                     | subscription           | CHECK           | null           |
| realtime          | 17012_17404_5_not_null                     | subscription           | CHECK           | null           |
| realtime          | 17012_17404_6_not_null                     | subscription           | CHECK           | null           |
| realtime          | 17012_17404_7_not_null                     | subscription           | CHECK           | null           |