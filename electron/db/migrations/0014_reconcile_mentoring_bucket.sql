-- Custom SQL migration file, put your code below! --

-- Mentoring hours no longer count toward attendance (user preference). Move any
-- existing mentoring rule out of the counted 'project' bucket into 'excluded',
-- matching how meetings are treated. Guarded so a value that isn't the old
-- default is left alone.
UPDATE `period_type_rules` SET `bucket` = 'excluded' WHERE `type` = 'mentoring' AND `bucket` = 'project';