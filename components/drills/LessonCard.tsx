'use client';

import React from 'react';
import Link from 'next/link';
import { Panel } from '@/components/ds';
import { readProgress } from '@/lib/drillProgress';
import type { Lesson } from '@/lib/drills';
import styles from './LessonCard.module.css';

const classes = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

export interface LessonCardProps {
    lesson: Lesson;
    /** Its place in the ladder, 1-based. Drawn as a board number. */
    ordinal: number;
    drillIds: readonly string[];
}

export default function LessonCard({ lesson, ordinal, drillIds }: LessonCardProps) {
    // After mount, never during render: the server has no localStorage, and a
    // count read while rendering would not match what it sent.
    const [done, setDone] = React.useState<ReadonlySet<string>>(() => new Set());
    React.useEffect(() => {
        const completed = new Set(readProgress().completed);
        setDone(new Set(drillIds.filter((id) => completed.has(id))));
    }, [drillIds]);

    const total = drillIds.length;
    const solved = done.size;
    const complete = total > 0 && solved === total;

    // The classic number colours only run to 8; past that the digit stays ink.
    const numClass = ordinal <= 8 ? styles[`num${ordinal}`] : undefined;

    return (
        <li>
            <Panel className={classes(styles.row, total === 0 && styles.rowEmpty)}>
                <span
                    className={classes('ms-pixel', styles.ordinal, numClass, complete && styles.ordinalDone)}
                    aria-hidden="true">
                    {ordinal}
                </span>

                <div className={styles.body}>
                    <h2 className={styles.title}>
                        {total === 0
                            ? lesson.title
                            : (
                                <Link href={`/drills/${lesson.id}`} className={styles.link}>
                                    {lesson.title}
                                </Link>
                            )}
                    </h2>
                    <p className={styles.blurb}>{lesson.blurb}</p>

                    {total > 0 && (
                        <p className={`ms-pixel ${styles.progress}`}>
                            {/* One square per drill. The caption beside them is
                                what says so — unlabelled, they were just shapes. */}
                            <span className={styles.pips} aria-hidden="true">
                                {drillIds.map((id) => (
                                    <span key={id} className={classes(styles.pip, done.has(id) && styles.pipDone)} />
                                ))}
                            </span>
                            {complete ? 'Complete' : `${solved} of ${total} solved`}
                        </p>
                    )}
                </div>

                {total === 0 ? (
                    <span className={`ms-pixel ${styles.soon}`}>Coming soon</span>
                ) : (
                    // aria-hidden: the link already names the lesson, and the
                    // verb read aloud after it would announce a second control.
                    <span className={`ms-pixel ${styles.action}`} aria-hidden="true">
                        {complete ? 'Review' : solved > 0 ? 'Resume' : 'Start'}
                        <span>&gt;</span>
                    </span>
                )}
            </Panel>
        </li>
    );
}
