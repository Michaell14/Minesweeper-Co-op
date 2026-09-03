import React from "react";
import Avatar from "./Avatar";
import styles from "./NameWithAvatar.module.css";

export interface NameWithAvatarProps {
    /** Avatar id from shared/avatars.js; null/undefined is an anonymous player. */
    avatar?: string | null;
    size?: number;
    /** The name itself, markup allowed (e.g. <strong>). */
    children: React.ReactNode;
}

/**
 * A player's name with their avatar: the one rendering of the rule that an
 * ANONYMOUS player is a bare name, never a default face implying an account.
 */
export default function NameWithAvatar({ avatar, size = 20, children }: NameWithAvatarProps) {
    return (
        <span className={styles.root}>
            {avatar && <Avatar id={avatar} size={size} className={styles.avatar} />}
            <span className={styles.name}>{children}</span>
        </span>
    );
}
