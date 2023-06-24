import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  ManyToOne,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
  Unique,
} from "typeorm";
import { DegreeEnum, ApprovedDegreeList } from "../types/degrees";
import { User } from "./User";
import { Section } from "./Section";

@Entity()
@Unique(["name", "author"])
export class Timetable {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @Index()
  @ManyToOne(() => User, (author) => author.timetables, { eager: true })
  author!: User;

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({
    type: "enum",
    array: true,
    enum: ApprovedDegreeList,
  })
  degrees!: DegreeEnum[];

  @Column({ type: "boolean", default: true })
  private!: boolean;

  @Column({ type: "boolean", default: true })
  draft!: boolean;

  @ManyToMany(() => Section, (section) => section.timetables, { eager: true })
  sections!: Section[];

  @Column({ type: "varchar", length: 3, array: true })
  timings!: string[];

  @Column({ name: "midsem_times", type: "timestamptz", array: true })
  midsemTimes!: Date[];

  @Column({ name: "compre_times", type: "timestamptz", array: true })
  compreTimes!: Date[];

  // e.g. ["CS F211-LP", "CS F212-L"]
  @Column({ type: "varchar", length: 30, array: true })
  warnings!: string[];

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: "last_updated",
    type: "timestamptz",
    onUpdate: "CURRENT_TIMESTAMP",
    nullable: true,
  })
  lastUpdated!: Date;
}
